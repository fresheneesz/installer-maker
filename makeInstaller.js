var child = require("child_process")
var fs = require("fs")
var domain = require('domain')
var path = require('path')
//var zlib = require('zlib')

var Future = require('async-future')
//var fstream = require("fstream")
//var uuencode = require('js-uuencode/lib/uuencode')  // dependency: "js-uuencode":"https://github.com/teeterc/js-uuencode/archive/49a8603f712d47809d66315f9623ddaf8da0db40.tar.gz",
//var tar = require('tar-stream')


var temporaryPackageFolder = 'temporaryPackageFolder'

module.exports = function(filepath, options) {
    if(options.nodeVersions === undefined || !(options.nodeVersions.length > 0)) {
        throw Error("You must specify at least one version in options.nodeVersions")
    }
    if(options.files === undefined) {
        options.files = []
    }

    if(module.exports.switch === 'run') {
        runScripts(options)
    } else { // build
        build(filepath, options)
    }
}

module.exports.switch = 'build'
module.exports.Future = Future

var run = module.exports.run = function (command, printToConsole){
    if(printToConsole === undefined) printToConsole = true

    var stdout = '', stderr = '', stdtogether = ''
    var childProcess = child.exec(command)

    var aChild = futureChild(childProcess)
    aChild.stdout.on('data', function(data){
        stdout += data
        stdtogether += data
    })
    aChild.stderr.on('data', function(data){
        stderr += data
        stdtogether += data
    })

    if(printToConsole) {
        aChild.stdout.pipe(process.stdout)
        aChild.stderr.pipe(process.stderr)
    }

    return aChild.then(function(code) {
        if(code !== 0){
            var e = Error('command "'+command+'" ended with non 0 return code ('+code+') '+stdtogether)
            e.code = code
            e.stdout = stdout
            e.stderr = stderr
            throw e
        }

        return Future({responseCode: code, stdout: stdout, stderr: stderr, stdtogether: stdtogether})
    })
}

function absoluteOrBackADirectory(thePath) {
    return thePath.indexOf('..') === 0 || !isRelative(thePath)
}

function isRelative(p) {
    var normal = path.normalize(p);
    var absolute = path.resolve(p);
    return normal != absolute;
}

function runScripts(options) {
    var args = process.argv.slice(3) // original command line arguments
    options.run(args)
}

function build(filepath, options) {
    // find highest node version
    var zeroVersion = [0,0,0]
    var highestNodeVersion = zeroVersion;
    options.nodeVersions.forEach(function(v) {
        var parts = v.split('.').map(function(v) {
            return parseInt(v)
        })
        parts.string = v // save the raw string

        if( parts[0] > highestNodeVersion[0]
         || parts[0] === highestNodeVersion[0] && parts[1] > highestNodeVersion[1]
         || parts[0] === highestNodeVersion[0] && parts[1] === highestNodeVersion[1] && parts[2] > highestNodeVersion[2]) {

           highestNodeVersion = parts
        }
    })
    
    if(highestNodeVersion === zeroVersion) {
        throw Error("didn't successfully get any node version : ( . Make sure your options.nodeVersions array contains versions of the format 'X.X.X'")   
    }

    function addToPackage(fileOrFoldlerpath, destinationPath) {
        return Future(true).then(function() {
            if(destinationPath === undefined) {
                destinationPath = path.basename(fileOrFoldlerpath)
            }

            if(!absoluteOrBackADirectory(fileOrFoldlerpath)) {
                destinationPath = path.relative('.', path.dirname(fileOrFoldlerpath)) +path.sep+ destinationPath
            }

            makePath(temporaryPackageFolder+ path.sep +path.dirname(destinationPath))

            //options.files.push(temporaryPackageFolder+'/'+destinationPath+path.basename(fileOrFoldlerpath))
            return run('cp -Rf '+fileOrFoldlerpath+' '+temporaryPackageFolder+ path.sep +destinationPath)
        })
    }

    // add things to package
    var packageFutures = []
    fs.mkdirSync(temporaryPackageFolder)

    // preinstaller.js
    packageFutures.push(addToPackage(__dirname+"/components/preinstaller.js"))
    // top-level script
    var installScriptPath = process.mainModule.filename
    var installScriptFileName = path.basename(installScriptPath)
    packageFutures.push(addToPackage(installScriptPath))
    // this script (renamed to the package name)
    packageFutures.push(addToPackage(__filename, 'node_modules/installer-maker.js'))
    // this script's dependencies
    packageFutures.push(addToPackage(__dirname+'/node_modules/async-future/asyncFuture.js', 'node_modules/async-future.js')) // rename to the package name
    packageFutures.push(addToPackage(__dirname+'/node_modules/async-future/node_modules/trimArguments/trimArguments.js', 'node_modules/'))

    // add requested files to package

    for(var n=0; n<options.files.length; n++) {
        packageFutures.push(addToPackage(options.files[n]))
    }

    Future.all(packageFutures).then(function(files) {
        // package files with script
        return packageFiles(files).then(function(encodedData) {
            var payloadMarkerName = 'PAYLOADIMMINENT'

            fs.writeFileSync(filepath, '#!/bin/bash\n'
                +'set -e\n'
                +'\n'
                +'type wget >/dev/null 2>&1 || {\n'
                +'  yum install -y wget # required for the node.js installation\n'
                +'}\n'
                +'\n'
                +'# node.js\n'
                +'type node >/dev/null 2>&1 || { # check if command "node" exists\n'
                +'  currentDir=$(pwd) # save cwd\n'
                +'  cd /usr/local/src/\n'
                +'  wget http://nodejs.org/dist/v'+highestNodeVersion.string+'/node-v'+highestNodeVersion.string+'.tar.gz\n'
                +'  tar -xvf node-v'+highestNodeVersion.string+'.tar.gz\n'
                +'  cd node-v'+highestNodeVersion.string+'\n'
                +'  ./configure\n'
                +'  make\n'
                +'  make install\n'
                +'      # node.js links to make sudo work right\n'
                +'  ln -s /usr/local/bin/node /usr/bin/node\n'
                +'  ln -s /usr/local/lib/node /usr/lib/node\n'
                +'  ln -s /usr/local/bin/npm /usr/bin/npm\n'
                +'  ln -s /usr/local/bin/node-waf /usr/bin/node-waf\n'
                +'  # clean up\n'
                +'  cd ..\n'
                +'  rm node-v'+highestNodeVersion.string+'.tar.gz\n'
                +'  rm -Rf node-v'+highestNodeVersion.string+'\n'
                +'  cd $currentDir # restore cwd\n'
                +'}\n'
                +'\n'
                +'type uuencode >/dev/null 2>&1 || {\n'
                +'  yum install -y sharutils # for uuencode and uudecode\n'
                +'}\n'
                +'\n'
                +'function untar_payload()\n'
                +'{\n'
                +"    match=$(grep --text --line-number '^"+payloadMarkerName+":$' $0 | cut -d ':' -f 1)\n"
                +'    payload_start=$((match + 1))\n'
                +'    tail -n +$payload_start $0 | uudecode | tar -xzv\n'
                +'}\n'
                +'\n'
                +'if [ -d "'+temporaryPackageFolder+'" ]\n'
                +'then\n'
                +'  rm -Rf "'+temporaryPackageFolder+'"\n'
                +'fi\n'
                +'untar_payload\n'
                +'cd '+temporaryPackageFolder+'\n'
                +'node preinstaller "'+installScriptFileName+'" "$@"' // forward parameters into the preinstall script
                +' || : \n' // ignores errors on this line, since errors are already reported via node.js (":" means no-op)
                +'cd ..\n'
                +'rm -Rf '+temporaryPackageFolder+' # clean up\n'
                +'\n'
                +'exit 0\n'
                +payloadMarkerName+':\n'+encodedData)

            fs.chmodSync(filepath, '776')
        })
    }).finally(function() {
        return run('rm -Rf '+temporaryPackageFolder+'/').then(function() {
            console.log('done')
        })
    }).done()
}

// wraps a child-process object into a future that also has the stream properties stdout and sterr
function futureChild(childProcess) {
    var f = new Future
    f.stdout = childProcess.stdout
    f.stderr = childProcess.stderr
    childProcess.on('error', function(e) {
        f.throw(e)
    })
    childProcess.on('exit', function(code, signal) {
        if(code !== null) {
            f.return(code)
        } else if(signal !== null) {
            f.throw('Process was killed with signal: '+signal)
        } else {
            f.throw(Error("Unknown")) // should never happen
        }
    })

    return f
}

// path is a path to a desired directory
// if any of the parts of the path don't yet exist, they will be created as directories
function makePath(directoryPath) {
    var parts = directoryPath.split(path.sep)

    var current = ''
    for(var n=0; n<parts.length; n++) {
        current += parts[n]+path.sep
        if(fs.existsSync(current)) {
            if(!fs.statSync(current).isDirectory()) {
                throw Error(current+' already exists but isn\'t a directory.')
            }
        } else {
            fs.mkdirSync(current)
        }
    }
}

// takes in a list of files and packages them into a uuencoded gzipped tarball of all the files
// returns a future string of the resulting tarball
function packageFiles(files) {
    var command = 'tar -czvf - "'+temporaryPackageFolder+'"'
    /*files.forEach(function(file) {
        command+= ' '+file
    })*/

    command += ' | uuencode -'


    return run(command, false).then(function(commandResult) {
        return Future(commandResult.stdout)
    })

    /*// tar all the files together
    var tarer = tar.pack()

    // add a file called my-stream-test.txt from a stream
    var entry = pack.entry({ name: 'my-stream-test.txt' }, function(err) {
        console.log("test2")
        // the stream was added
        // no more entries
        pack.finalize();
    });
    fs.createReadStream('test.txt').pipe(entry);

    // pipe the pack stream somewhere
    pack.pipe(process.stdout);


    var tarer = tar.Pack({ noProprietary: true })

    var filestreams = []
    files.forEach(function(file) {
        var options = {path: file}
        if(fs.statSync(file).isDirectory()) {
            options.type = "Directory"
        }

        var reader = fstream.Reader(options)
        filestreams.push(reader)

        streamToString(reader).then(function(stuff) {
            console.log(stuff)
        }).done()
    })

    //pipeInOrder(filestreams, tarer).done() // tar all the files

    // gzip
    var tarball = tarer.pipe(zlib.createGzip())

    // uuencode
    var encodedTarball = tarball.pipe(new uuencode({encoder: true}))

    // output
    return streamToString(encodedTarball)

    return Future(true)
    */

}

/*
// pipes a list of input streams into a destinationStream, in the given order
// returns a future that returns when the piping is complete
// if end is true (the default) the destination stream is ended after all the inputs are fed in
function pipeInOrder(inputs, destinationStream, end) {
    if(end === undefined) end = true

    var result = new Future

    var d = domain.create()
    d.on('error', function(e) {
        result.throw(e)
    })

    d.run(function() {
        var next = 0

        function pipeNext() {
            inputs[next].pipe(destinationStream).on('end', function() {
                console.log("wefwaefe")
            })
            inputs[next].on('end', function() {
                next++
                if(next < inputs.length) {
                    pipeNext()
                } else { // last one just ran
                    result.return()
                    if(end) destinationStream.end()
                }
            })

            destinationStream.on('end', function() {
                console.log("wuuut")
            })
        }

        pipeNext()
    })

    return result
}

function streamToString(stream) {
    return streamToSerialization(stream, '', function(x, y) {
        return x+y
    })
}

function streamToSerialization(stream, initialization, append) {
    var result = new Future

    var data = initialization
    stream.on('data', function(newdata) {
        data = append(data, newdata)
    })
    stream.on('end', function() {
        result.return(data)
    })
    stream.on('error', function(e) {
        result.throw(e)
    })

    return result
}
*/
