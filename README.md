
`installer-maker`
=====

A module for node.js programs that packages multiple files into a single script (bash shell script) that will run a node.js program on a machine, whether or not it has node.js already installed (it will install node.js if it isn't already). The package can be build on any system, but since the package is a bash script, it will only be runnable on systems that can execute those.

It's recommended that this be used in conjunction with [incremental-installer](https://github.com/fresheneesz/incremental-installer).


Example
=======

```javascript
var makeInstaller = require('installer-maker')
var fs = require("fs")

var entrypointFileStream = fs.createReadStream("myInstaller.js")
var packageStream = makeInstaller({
    nodeVersions: ['0.10.29'], // which node.js versions can be installed
	files: [
    	{name: 'index.js', body: entrypointFileStream},
        'package.json',
        'node_modules/incremental-installer',
        {name: 'imaginaryFileName.txt', location: "box/whatsinthebox.txt"}
    ]
})

var outputStream = packageStream.pipe(fs.createWriteStream("myInstaller.sh")) // create the installer shell script
outputStream.on('finish', function() {
    console.log("done!")
})
 ```


Install
=======

```
npm install installer-maker
```

#Usage

## Steps

1. **Write the script builder** - Any files that the entrypoint script might use (including `require`d modules) must be added to the `files` list.
2. **Run the script builder to generate the shell script**
3. **Run the shell script on the target machine** - The resulting shell script should be copied to the machine on which you want to run the installation. Run the shell script wherever is appropriate with whatever commandline arguments are appropriate.
  * The script can be copied via scp or even simply copy-pasted into a terminal editor and saved.
  * currently this has to be a machine that can execute bash scripts
  * The script only needs to be run with `sudo` if you expect it to install node.js. Otherwise you shouldn't have to use `sudo` unless your installation script itself requires it.

**Note**: The node install script runs in a temporary directory that is be deleted after the install process. If you want to access the directory that the shell script was run from, it is the parent directory of the directory in which the node script is run in (ie process.directory+"/..").

**Vagrant note**: this installer (like many many other things) won't work in a linux-vagrant *shared directory* in a windows host environment. Run it in a location outside the shared directory

## node API

```javascript
var makeInstaller = require('installer-maker')
```

`makeInstaller.fs = require("graceful-fs")` - set an object that will be used in place of fs inside installer-maker

`var packageStream = makeInstaller(options)` - creates an installer shell script

* `installerJavascriptFile` - A handle to the javascript to Can either be an object with a `toString` method, or it can be a `Stream`.
* `options` - A set of options for how the installer is created. Has the following properties:
 * `nodeVersions` - An array of acceptable node.js versions, each in the format 'X.XX.XX' (e.g. '0.10.25'). *Currently the version of node.js is not checked.*
 * `files` - A list of entries representing files the installation script will embed in the generated shell script. They can be accessed from the script as if the files were in their current relative locations. IMPORTANT: the first element of the list will be used as the entrypoint script. When the generated shell script is run, the last thing it will do is call `node <entrypoint file name>`. Each entry can be one of the following:
   * A path to a file or folder on the file system. Absolute paths and paths that are in a parent directory of the entrypoint file will be placed at the root of the temporary directory inside the package (so if the entrypoint is also at the root, it could access those files via` __dirname+'/<filename>'` or `require('.<filename>')`). If you want behavior that unpacks files into parent directories or absolute paths, instead pass an object with a `location` as a property.
   * An object with the following properties:
     * `name` - The filename that will be written into (and subsequently unpacked from) the tar file
     * `body` - (*Optional*) The file body, which can either be [a Readable stream object](http://nodejs.org/api/stream.html), a `Buffer`, or an object with a `toString` method
     * `location` - (*Optional*) A path that the file or folder contents should come from. For directories, if this is blank, an empty diretory will be created.
     * `type` - (*Optional*) Either `'file'`, `'directory'`, or `undefined`. If left `undefined`, the type will be found by using the location if available, or will default to "file", if there is no location given.
 * `tempDir` - (*Optional*) The temporary directory that will be created in the current working directory when the shell script is run. The default is `'temporaryPackageFolder'`.

`packageStream.on('error', function(e) {...})` - error handling as usual with streams

Dependencies
======

Node version 0.10.26 or higher is required (a bug was found in 0.10.25)

The following console commands are required to run the generated shell script:
* `cp`
* `rm`
* `tar`

Tested OSes
==========

Building the installer:
* Centos 6.5
* Windows 8

Running the installer:
* Centos 6.5

Todo
====

* package the node.js installer into the tar data, instead of requiring network access to install node.js
* Test on various operating systems
* if node.js already exists, check to make sure the version is one of the listed nodeVersions
* use browserify to package together the main script, so the user doesn't have to manually specify which dependencies to package up
* Make this able to output .bat files for windows
* Figure out a way to make the current working directory the directory you run the shell script from without making the entrypoint scripts working directory unintuitive
* Figure out if its possible to avoid requiring sudo to install node (maybe this: http://tnovelli.net/blog/blog.2011-08-27.node-npm-user-install.html)

How to Contribute!
============

Anything helps:

* Creating issues (aka tickets/bugs/etc). Please feel free to use issues to report bugs, request features, and discuss changes
* Updating the documentation: ie this readme file. Be bold! Help create amazing documentation!
* Submitting pull requests.

How to submit pull requests:

1. Please create an issue and get my input before spending too much time creating a feature. Work with me to ensure your feature or addition is optimal and fits with the purpose of the project.
2. Fork the repository
3. clone your forked repo onto your machine and run `npm install` at its root
4. If you're gonna work on multiple separate things, its best to create a separate branch for each of them
5. edit!
6. If it's a code change, please add to the unit tests (at test/protoTest.js) to verify that your change
7. When you're done, run the test and test the resulting installer on a fresh linux installation (try vagrant) to make sure things still work right
  * The resulting installer ("mytestinstaller.sh") should print out all the files in the embedded package, then should print 'one', 'checking two', 'Running two. ...' and print the command line arguments, 'three', then 'four' the first time
  * Subsequent runs should *not* print out 'one', 'three', or 'four' but should print out the rest.
  * I recommend using vagrant snapshots to test your work
8. Commit and push your changes
9. Submit a pull request: https://help.github.com/articles/creating-a-pull-request


Change Log
=========

* 1.1.1 - adding installation of development tools necessary for node.js compilation if they aren't already installed
* 1.1.0 - allow passing in an object to be used in place of `fs`
* 1.0.4 - fixing bugs in linux and unit tests
* 1.0.3 - support buffers
* 1.0.2 - documentation corrections
* 1.0.1 - minor improvements, and adding "engines" to package.json
* 1.0.0 - Breaking change
  * changed the interface so that it no longer uses the currently executing file as the entrypoint (instead you have to specify the entrypoint)
  * added support for input streams and return an output stream (instead of writing to the file system)
  * Using node modules instead of commandline programs to make building the package cross platform (the package is still a shell script, so limited to systems where that can be run)
  * adding a node.js style errback
  * Getting rid of the payload marker, in favor of a payload index
  * Switching to base64 format for the archive rather than uuencode (because I couldn't find a [working] uuencode module for node, but I found out that base64 is better anyways)
  * adding a way to rename/re-path files and directories in the `files` list
* 0.0.1 - first!

License
=======
Released under the MIT license: http://opensource.org/licenses/MIT