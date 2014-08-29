var fs = require("fs")
var path = require('path') 

try {
    var makeInstaller = require('../makeInstaller')
} catch(e) {
    var makeInstaller = require('installer-maker') // this is because requiring it this way is currently necessary in the packaged script
}

var Future = makeInstaller.Future


makeInstaller('mytestinstaller.sh', {
    nodeVersions: ['0.10.25'],

    run: function(args) {
        console.log("The command-line arguments are: "+args)

        console.log('  '+fs.readFileSync('test.txt').toString())
        console.log('  '+fs.readFileSync('moreFiles/another.txt').toString())
        console.log('  '+fs.readFileSync('someFiles/yetAnother.txt').toString())
        console.log('  '+fs.readFileSync('test2.txt').toString())
        console.log('  '+fs.readFileSync('MIT_LICENSE').toString().split('\n')[0]) // just print out first line
    },

    files: [
        "test.txt",                 // single file
        "moreFiles/another.txt",    // file in folder
        "someFiles",                // directory
        path.resolve('test2.txt'),  // absolute file path
        "../MIT_LICENSE"            // file-path in ancestor directory
    ]
})
