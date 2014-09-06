var fs = require("fs")
var path = require('path')
var child = require('child_process')

var Unit = require("deadunit")

var streamUtils = require('../streamUtils')

Unit.test(function() {
    var makeInstaller = require('../makeInstaller')

    var nodeVersions = ['0.10.29']

    this.test('success', function(t) {
        this.count(3)

        var entrypoint = 'index.js'
        var outputName = 'mytestinstaller.sh'

        var packageStream = makeInstaller({
            nodeVersions: nodeVersions,
            files: [
                {name:  entrypoint,
                 body:  'var fs = require("fs")\n'+
                        'var path = require("path")\n'+
                        'console.log("The command-line arguments are: "+process.argv)\n'+
                        //'console.log("Working directory contains the shell script: "+fs.existsSync(process.cwd()+path.sep+"'+outputName+'"))\n'+ // see below in the expected output to ready why this is problematic
                        'console.log("Working directory is: "+path.basename(process.cwd()))\n'+

                        'console.log("  "+fs.readFileSync("test.txt").toString())\n'+
                        'console.log("  "+fs.readFileSync("notherFolder/x/y.txt").toString())\n'+
                        'console.log("  "+fs.readFileSync("streamFile").toString())\n'+
                        'console.log("  "+fs.readFileSync("stringFile").toString())\n'+
                        'console.log("  "+fs.readFileSync("moreFiles/another.txt").toString())\n'+
                        'console.log("  "+fs.statSync("moarDirectory").isDirectory())\n'+
                        'console.log("  "+fs.readFileSync("someFiles/yetAnother.txt").toString())\n'+
                        'console.log("  "+fs.readFileSync("test2.txt").toString())\n'+
                        'console.log("  "+fs.readFileSync("MIT_LICENSE").toString().split("\\n")[0]) // just print out first line\n'
                },
                "test.txt",                                                        // single file
                "notherFolder",                                                    // directory
                {name: 'streamFile', body: fs.createReadStream('test3.txt'), size: fs.statSync('test3.txt').size},      // file stream
                {name: 'stringFile', body: "striiiiing"},                          // file string
                {name: "moreFiles/another.txt", location: "moreFiles/another.txt"},// file in folder
                {name: "moarDirectory", type: 'directory'},                        // directory
                {name: "someFiles", location: 'someFiles'},                        // directory with location
                path.resolve('test2.txt'),                                         // absolute file path
                "../MIT_LICENSE",                                                  // file-path in ancestor directory
            ]
        })

        packageStream.on('error', function(e) {
            t.ok(false, e)
        })
        packageStream.on('end', function() {
            t.ok(true)
        })

        packageStream.pipe(fs.createWriteStream(outputName)).on('finish', function() {
            t.ok(fs.existsSync(outputName))

            t.test('script runs correctly', function(t) {
                this.count(1)

                //fs.chmodSync(outputName, '776')
                var c = child.spawn("bash", [outputName, 'moo'])
                var output = ''
                c.stdin.on('data', function(data) {
                    output += data
                })
                c.stderr.on('data', function(data) {
                    output += data
                })
                c.on('close', function() {

                    //Removed the following from the match regexp: "Working directory contains the shell script: true"+ // while ideal, this would either require that I unpack things without a temp folder (which has a higher likelyhood over overwritings stuff and is harder to clean up), or the current working directory would be one directory above the entrypoint script, which would likely be confusing to those using this
                    t.ok(output.match(new RegExp(
                        "The command-line arguments are: node,.*"+entrypoint+",moo\n"+

                        "Working directory is: temporaryPackageFolder"+
                        "  I am zee test file\n"+
                        "  yyyyyyyy\n"+
                        "  the test3 file man\n"+
                        "  striiiiing\n"+
                        "  another test file\n"+
                        "  true\n"+
                        "  ANOTHER ONE\n"+
                        "  But I am test file too\n"+
                        "  The MIT License (MIT)\n"
                    )) !== null, output)
                })
            })
        })
    })


    this.test('tempDir option', function(t) {
        this.count(2)

        var outputName = 'mytestinstaller2.sh'
        var tempDir = 'testTempDir'

        var packageStream = makeInstaller({
            nodeVersions: nodeVersions,
            tempDir: tempDir,
            files: [{name:  'index.js', body:  'var path = require("path")\n'+'console.log(path.basename(__dirname))'}]
        })

        packageStream.pipe(fs.createWriteStream(outputName)).on('finish', function() {
            t.ok(fs.existsSync(outputName))

            t.test('script runs correctly', function(t) {
                this.count(1)

                var c = child.spawn("bash", [outputName, 'moo'])
                var output = ''
                c.stdin.on('data', function(data) {
                    output += data
                })
                c.stderr.on('data', function(data) {
                    output += data
                })
                c.on('close', function() {
                    t.eq(output, tempDir)
                })
            })
        })
    })

    this.test('buffers', function(t) {
        this.count(3)

        var outputName = 'mytestinstaller3.sh'
        var bufString = "漢字"
        var buf = new Buffer("漢字")
        var bufFileLocation = __dirname+'/buf'      // the location to create the file

        t.ok(!fs.existsSync(bufFileLocation))

        var packageStream = makeInstaller({
            nodeVersions: nodeVersions,
            files: [
                {name:  'index.js', body:  'var fs = require("fs")\n'+'fs.writeFileSync(__dirname+"/../buf", fs.readFileSync(__dirname+"/buf"))'},
                {name:  'buf', body:  buf}
            ]
        })

        t.ok(buf.length !== buf.toString().length) // this test is only valid if they aren't the same (cause that was the problem)

        packageStream.pipe(fs.createWriteStream(outputName)).on('finish', function() {
            t.test('script contains correct contents', function(t) {
                this.count(1)

                var c = child.spawn("bash", [outputName])
                var output = ''
                c.stdin.on('data', function(data) {
                    output += data
                })
                c.stderr.on('data', function(data) {
                    output += data
                })
                c.on('close', function() {
                    var newBufContents = fs.readFileSync(bufFileLocation)
                    t.eq(newBufContents.toString(), bufString)
                    fs.unlinkSync(bufFileLocation)
                })
            })
        })
    })

    this.test('errors', function() {

        this.test('nonexistent entity', function(t) {
            this.count(1)

            var packageStream = makeInstaller({
                nodeVersions: nodeVersions,
                files: [
                    "nonexistantEntity",
                ]
            })

            packageStream.on('error', function(e) {
                t.ok(e.message.match(/ENOENT, no such file or directory '.*nonexistantEntity'/) !== null, e)
            })
            packageStream.on('end', function() {
                t.ok(false) // finish shouldn't happen if an error happens
            })
        })

        this.test('entry with invalid body', function(t) {
            this.count(1)

            var packageStream = makeInstaller({
                nodeVersions: nodeVersions,
                files: [
                    {name: 'stringFile', body: {toString: 324}},
                ]
            })

            packageStream.on('error', function(e) {
                t.eq(e.message, "Property 'toString' of object object is not a function")
            })
            packageStream.on('end', function() {
                t.ok(false) // finish shouldn't happen if an error happens
            })
        })

        this.test('invalid options', function(t) {
            this.count(1)

            var packageStream = makeInstaller()

            packageStream.on('error', function(e) {
                t.eq(e.message, "Cannot read property \'tempDir\' of undefined")
            })
            packageStream.on('end', function() {
                t.ok(false) // finish shouldn't happen if an error happens
            })
        })
    })
}).writeConsole()


// test
    // test the tempDir option
    // make sure the current working directory is right (the directory the script is run from)