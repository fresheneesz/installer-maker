var fs = require("fs")
var domain = require('domain')
var path = require('path')
var zlib = require('zlib')
var Stream = require("stream")

var CombinedStream = require('combined-stream')
var tar = require('tar-stream')
var base64 = require("base64-stream")
var Future = require('async-future')
Future.debug = true

module.exports = function(options) {
    try {
        if(options.tempDir === undefined) options.tempDir = 'temporaryPackageFolder'

        if(options.nodeVersions === undefined || !(options.nodeVersions.length > 0)) {
            throw Error("You must specify at least one version in options.nodeVersions")
        }
        if(options.files === undefined || options.files.length === 0) {
            throw Error("You must specify at least one file to package in 'option.files'")
        }

        var resultStream = new Stream.PassThrough

        var highestNodeVersion = findHighestNodeVersion(options.nodeVersions)
        if(highestNodeVersion === undefined) {
            throw Error("didn't successfully get any node version : ( . Make sure your options.nodeVersions array contains versions of the format 'X.X.X'")
        }

        var entities = processFileEntries(options.files, function(e) {
            resultStream.emit('error', e)
        })

        var pack = tar.pack()
        pack.entry({name: options.tempDir, type: 'directory'}) // add the temporary directory


        var curFuture = Future(true)
        entities.forEach(function(entity) {
            curFuture = curFuture.then(function() {
                var f = new Future
                var entry = pack.entry({name: options.tempDir+'/'+entity.name, type: entity.type, size: entity.size}, function(err) {
                    if(err) {
                        err.message += " for entry "+entity.name
                        f.throw(err)
                    }
                    else f.return()
                })
                if(entity.type === 'file') {
                    pipe(entity.stream, entry)
                }

                return f
            })
        })

        var archiveStream = pipe(pack, zlib.createGzip())
        var encodedArchiveStream = pipe(archiveStream, base64.encode())
        var shellScriptStream = createShellScript(highestNodeVersion, options.tempDir, entities[0].name, encodedArchiveStream)
        pipe(shellScriptStream, resultStream)

        curFuture.then(function() {
            pack.finalize()
            //fs.writeFileSync(filepath, packageContents)
            //fs.chmodSync(filepath, '776')
        }).catch(function(e) {
            resultStream.emit('error',e)
        }).done()

        return resultStream

    } catch(e) {
        var result = new Stream.PassThrough
        setTimeout(function() {
            result.emit('error', e)
        })
        return result
    }
}

// normalizes the file entries and does some validation
function processFileEntries(files, handleError) {
    var entities = []
    for(var n=0; n<files.length; n++) {
        var entry = files[n]
        if(isString(entry)) { // file path
            var name = entry
            var info = fs.statSync(name)
            if(info.isDirectory()) {
                var type = 'directory'
                entities = entities.concat(getAllEntitiesInDirectory(name, name, readStream))
            } else {    // pretend file is the only other type of fs entity (will fail with links and symlinks)
                var type = 'file'
                var stream = readStream(name, "(1)")
                var size = info.size
            }

            if(absoluteOrBackADirectory(name)) {
                name = path.basename(name) // change name so that it ends up in the root of the package
            }

        } else if(entry instanceof Object) { // string or stream
            var name = entry.name

            if(entry.type === undefined) {
                if(entry.location !== undefined) {
                    var info = fs.statSync(entry.location)
                    if(info.isDirectory()) {
                        entry.type = 'directory'
                    } else {
                        entry.type = 'file'
                        var size = info.size
                    }
                } else {
                    entry.type = 'file'
                }
            }

            if(entry.type === 'file') {
                var type = 'file'
                if(entry.body !== undefined) {
                    var contents = entry.body
                    if(contents instanceof Stream.Readable) {
                        var stream = contents
                        var size = entry.size
                        if(size === undefined) {
                            throw new Error("Entry "+n+" in the 'files' list needs a 'size' because it is a stream")
                        }
                    } else if(contents.toString !== undefined) {
                        var contentsString = contents.toString()
                        var stream = stringToStream(contentsString)
                        var size = contentsString.length
                    } else {
                        throw new Error("The 'body' of entry "+n+" in the 'files' list is neither a Stream nor does it have a toString method")
                    }
                } else if(entry.location !== undefined) {  // file path
                    var stream = readStream(entry.location, "(2)")
                } else {
                    throw new Error("Entry "+n+" in the 'files' list doesn't have a 'body' or a 'location'")
                }
            } else if(entry.type === 'directory') {
                var type = 'directory'

                if(entry.location !== undefined) { // folder path
                    entities = entities.concat(getAllEntitiesInDirectory(entry.location, entry.name, readStream))
                }
            } else {
                throw new Error("Entry "+n+" in the 'files' list has an invalid type: '"+entry.type+"'")
            }
        } else {
            throw new Error("Entry "+n+" in the 'files' list is neither an Object file entry nor a String filepath")
        }

        entities.push({name: name, stream: stream, type: type, size: size})
    }

    return entities

    function readStream(name, number) {
        var stream = fs.createReadStream(name)
        stream.on('error', function(e) {
            handleError(new Error("Error "+number+" in ReadStream for '"+name+"': "+e))
        })
        return stream
    }
}

function getAllEntitiesInDirectory(location, basePath, readStream) {
    var entities = []
    fs.readdirSync(location).map(function(name) {
        var entityPath = location+'/'+name
        var info = fs.statSync(entityPath)
        if(info.isDirectory()) {
            var type = 'directory'
            entities = entities.concat(getAllEntitiesInDirectory(entityPath, basePath+'/'+name, readStream))
        } else {    // pretend file is the only other type of fs entity (will fail with links and symlinks)
            var type = 'file'
            var stream = readStream(entityPath, "(3)")
            var size = info.size
        }
        entities.push({name: basePath+'/'+name, stream: stream, type: type, size: size})
    })

    return entities
}

function createShellScript(highestNodeVersion, tempDirectory, entrypointFile, encodedDataStream) {
    var negativePayloadIndex = 1  // the number of lines from the end of the package we're building (only 1 cause there's no newlines in base64 encoded stuff)

    var shellScript = '#!/bin/bash\n'
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
        +'  wget http://nodejs.org/dist/v'+highestNodeVersion+'/node-v'+highestNodeVersion+'.tar.gz\n'
        +'  tar -xvf node-v'+highestNodeVersion+'.tar.gz\n'
        +'  cd node-v'+highestNodeVersion+'\n'
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
        +'  rm node-v'+highestNodeVersion+'.tar.gz\n'
        +'  rm -Rf node-v'+highestNodeVersion+'\n'
        +'  cd $currentDir # restore cwd\n'
        +'}\n'
        +'\n'
        +'\n'
        +'function untar_payload()\n'
        +'{\n'
        +'    tail -n '+negativePayloadIndex+' $0 | base64 --decode | tar -xz\n'
        +'}\n'
        +'\n'
        +'if [ -d "'+tempDirectory+'" ]\n'
        +'then\n'
        +'  rm -Rf "'+tempDirectory+'"\n'
        +'fi\n'
        +'untar_payload\n'
        +'cd '+tempDirectory+'\n'
        +'node '+entrypointFile+' "$@"' // forward parameters into the preinstall script
        +' || : \n' // ignores errors on this line, since errors are already reported via node.js (":" means no-op)
        +'cd ..\n'
        +'rm -Rf '+tempDirectory+' # clean up\n'
        +'\n'
        +'exit 0\n'

        return concatStreams(stringToStream(shellScript), encodedDataStream)
}

function concatStreams(a,b) {
    var combinedStream = CombinedStream.create()
    combinedStream.append(a)
    combinedStream.append(b)

    return combinedStream
}
function stringToStream(s) {
    var a = new Stream.PassThrough()
    a.write(s)
    a.end()
    return a
}
function streamToString(s) {
    var f = new Future

    var theString = ''
    s.on('data', function(data) {
        theString+= data
    })
    s.on('end', function() {
        f.return(theString)
    })
    s.on('error', function(e) {
        f.throw(e)
    })

    return f
}

function findHighestNodeVersion(versionList) {
    // find highest node version
    var zeroVersion = [0,0,0]
    var highestNodeVersion = zeroVersion;
    versionList.forEach(function(v) {
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

    if(highestNodeVersion === zeroVersion)
        return undefined
    // else
    return highestNodeVersion.string
}

// god damnit..
function isString(a) {
    return typeof(a) === 'string' || a instanceof String
}

// pipes streams *and* propogates errors from source into destination
function pipe(source, destination) {
    source.pipe(destination)
    source.on('error', function(e){
        destination.emit(e)
    })
    return destination
}

function absoluteOrBackADirectory(thePath) {
    return thePath.indexOf('..') === 0 || !isRelative(thePath)
}

function isRelative(p) {
    var normal = path.normalize(p);
    var absolute = path.resolve(p);
    return normal != absolute;
}