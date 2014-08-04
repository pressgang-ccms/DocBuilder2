/**
 * A web worker that processes a chunk of the word list in the edits1() function from typo.js.
 * Splitting the code out into a thread improves the performance of the function significantly
 * when looking up large words.
 */
self.addEventListener('message', function (e) {
    var words = e.data;

    var rv = [];
    var alphabet = "abcdefghijklmnopqrstuvwxyz-' ";

    for (var ii = 0, _iilen = words.length; ii < _iilen; ii++) {
        var word = words[ii];

        for (var i = 0, _len = word.length + 1; i < _len; i++) {
            var s = [ word.substring(0, i), word.substring(i) ];

            if (s[1]) {
                rv.push(s[0] + s[1].substring(1));
            }

            // eliminate transpositions of identical letters
            if (s[1].length > 1 && s[1][1] !== s[1][0]) {
                rv.push(s[0] + s[1][1] + s[1][0] + s[1].substring(2));
            }

            if (s[1]) {
                for (var j = 0, _jlen = alphabet.length; j < _jlen; j++) {
                    // eliminate replacement of a letter by itself
                    if( alphabet[j] != s[1].substring(0,1) ){
                        rv.push(s[0] + alphabet[j] + s[1].substring(1));
                    }
                }
            }

            if (s[1]) {
                for (var j = 0, _jlen = alphabet.length; j < _jlen; j++) {
                    rv.push(s[0] + alphabet[j] + s[1]);
                }
            }
        }
    }

    self.postMessage(rv);
});
