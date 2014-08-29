
`installer-maker`
=====

A module for node.js programs that packages multiple files into a single script (shell script) that will run a node.js program on a machine (currently linux only), whether or not it has node.js already installed (it will install node.js if it isn't already).

It's recommended that this be used in conjunction with [incremental-installer](https://github.com/fresheneesz/incremental-installer).


Example
=======

```javascript
var makeInstaller = require('installer-maker')

makeInstaller('myInstaller.sh', {
    nodeVersions: ['0.10.25'], // indicates what node.js versions can be installed
	files: ['package.json', 'node_modules/incremental-installer'],
    run: function() {
    	// do whatever you want here, like..

        var install = require('incremental-installer')
        var run = install.run

        install('install.state', [
                function(args) {
                    run('yum install -y nano')
                },
                function(args) {
                    run('yum install -y locate')
                }
            ]
        )
    }
})
 ```


Install
=======

```
npm install installer-maker
```

#Usage

## Steps

1. **Write the script builder** - Create a node.js script that requires 'installer-maker' (it must be that name, currently, for the resulting script to work)
  * Any `require`d modules **other** than 'installer-maker' must be added to the `files` list. Any other files that you'll need to use can also be packaged in by including it in the `files` list.
2. **Run the script builder to generate the install script** - Running the node.js script you created will output a shell script at the `filepath` you specified
  * You must run the script-builder in an environment where the commands `tar`, `uuencode`, `cp -Rf`, and `rm -Rf` are all available (so basically, a linux machine)
3. **Run the install script on the target machine** - The resulting shell script should be copied to the machine on which you want to run the installation. Run the shell script wherever is appropriate with whatever commandline arguments are appropriate.
  * The script can be copied via scp or even simply copy-pasted into a terminal editor and saved.
  * currently this has to be a machine that can execute bash scripts, but does **not** require the `uudecode` command to already be installed (it will be automatically installed)
  * The script only needs to be run with `sudo` if you expect it to install node.js, or `uudecode`. Otherwise you shouldn't have to use `sudo` unless your installation script itself requires it.

**Note**: The node install script runs in a temporary directory that is be deleted after the install process. If you want to access the directory that the shell script was run from, it is the parent directory of the directory in which the node script is run in (ie process.directory+"/..").

**Vagrant note**: this installer (like many many other things) won't work in a linux-vagrant *shared directory* in a windows host environment. Run it in a location outside the shared directory

## node API

```javascript
var makeInstaller = require('installer-maker')
```

`makeInstaller(filepath, options)` - creates an installer shell script

* `filepath` - The shell script is created in this location
* `options` - A set of options for how the installer is created. Has the following properties:
 * `nodeVersions` - An array of acceptable node.js versions, each in the format 'X.XX.XX' (e.g. '0.10.25'). *Currently the version of node.js is not checked.*
 * `files` - A list of files and folders the installation script will need to run. These files will be embedded in the shell script. They can be accessed from the script as if the files were in their current relative locations.
 * `run` - A function to run when the generated install script is run.

Dependencies
======

The following console commands are required to build the installer:
* `tar`
* `uuencode`
* `cp`
* `rm`

The following console commands are required to run the installer:
* `cp`
* `rm`
* `tar`

Tested OSes
==========

* Centos 6.5

Todo
====

* have a way for files to be renamed/re-pathed in the files list
* Test on various operating systems
* if node.js exists, check to make sure the version is one of the listed nodeVersions
* Improve the way incremental-installer-maker creates the archive:
  * Either use this for the original tarring instead of creating a temporary folder: http://stackoverflow.com/questions/21790843/how-to-rename-files-you-put-into-a-tar-archive-using-linux-tar/21795845
  * or use tar-stream and zlip to create the archive (best solution, but more complex)
    * You can use [tar-fs](https://github.com/mafintosh/tar-fs) to pack directories!
* use browserify to package together the main script, so the user doesn't have to manually specify which dependencies to package up
* Make this work for windows

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

* 0.0.1 - first!

License
=======
Released under the MIT license: http://opensource.org/licenses/MIT