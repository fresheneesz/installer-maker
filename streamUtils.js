var Stream = require("stream")

var CombinedStream = require('combined-stream')
var Future = require('async-future')
Future.debug = true

exports.concatStreams = function(a,b) {
    var combinedStream = CombinedStream.create()
    combinedStream.append(a)
    combinedStream.append(b)

    return combinedStream
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