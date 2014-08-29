var install = require("installer-maker")
install.switch = 'run'

//  nvm - so we can upgrade node
//install.run('wget -qO- https://raw.github.com/creationix/nvm/master/install.sh | sh')

var mainScript = process.argv[2]
require("./"+mainScript)