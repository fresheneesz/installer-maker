var Stream = require("stream")

//var CombinedStream = require('combined-stream')
var Future = require('async-future')
Future.debug = true

exports.concatStreams = function(a,b) {
    return new ConcatStream(a,b)
}
exports.stringToStream = function(s) {
    var a = new Stream.PassThrough()
    a.write(s)
    a.end()
    return a
}
exports.streamToString = function(s) {
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



var Readable = require("stream").Readable
var util = require('util')

util.inherits(ConcatStream, Readable)
function ConcatStream(a,b) {
    var that = this
    Readable.call(this)

    this.current = a

    a.on('readable', function() {
        var data = a.read()
        if(data !== null) {
            that.push(data)
        }
    })
    a.on('end', function() {
        this.current = b
        b.on('readable', function() {
            var data = b.read()
            if(data !== null) {
                that.push(data)
            }
        })
        b.on('end', function() {
            that.push(null)
        })
    })
}

ConcatStream.prototype._read = function() {
    var data = this.current.read()
    if(data !== null) {
        this.push(data)
    }
}
