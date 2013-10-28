/*
    Hooks into the Bugzilla JSONRPC API to get the status of any bugs relating to the spec.
*/

(function() {

    logToConsole("Searching Bugzilla");

    function handleFailure(message) {

    }

    var specId = unsafeWindow.getSpecIdFromURL();
    var specProductUrl = "http://topika.ecs.eng.bne.redhat.com:8080/pressgang-ccms/rest/1/contentspecnodes/get/json/query;csNodeType=7;contentSpecIds=" + specId + "?expand=" + encodeURIComponent("{\"branches\":[{\"trunk\":{\"name\": \"nodes\"}}]}");
    var bugzillaBaseUrl = "https://bugzilla.redhat.com/"
    var bugzillaApiUrl = bugzillaBaseUrl + "jsonrpc.cgi";

    setTimeout(function() {
        GM_xmlhttpRequest({
            method: 'GET',
            url: specProductUrl,
            onabort: function() {handleFailure("onabort"); },
            onerror: function() {handleFailure("onerror");},
            ontimeout: function() {handleFailure("ontimeout");},
            onload: function(specNodesResponse) {

                logToConsole("Got spec nodes");

                var nodes = JSON.parse(specNodesResponse.responseText);
                var bzProduct = "";
                var bzComponent = "";
                var bzVersion = "";
                for (var nodeIndex = 0, nodeCount = nodes.items.length; nodeIndex < nodeCount; ++nodeIndex) {
                    var node = nodes.items[nodeIndex].item;
                    if (node.title == "BZProduct") {
                        bzProduct = node.additionalText;
                    } else if (node.title == "BZComponent") {
                        bzComponent = node.additionalText;
                    }  else if (node.title == "BZVersion") {
                        bzVersion = node.additionalText;
                    }
                }

                var data = '{"method":"Bug.search","params":[{';

                if (bzProduct != "") {
                    data += '"product": "' + bzProduct + '"';
                }

                if (bzComponent != "") {
                    data += '"component": "' + bzComponent + '"';
                }

                if (bzVersion != "") {
                    data += '"version": "' + bzVersion + '"';
                }

                data = '}], "id":1}';

                GM_xmlhttpRequest({
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    url: bugzillaApiUrl,
                    data: data,
                    onabort: function() {handleFailure("onabort"); },
                    onerror: function() {handleFailure("onerror");},
                    ontimeout: function() {handleFailure("ontimeout");},
                    onload: function(response) {

                        logToConsole("Got Bugzilla bugs");

                        var responseJson = JSON.parse(response.responseText);
                        var bugs = responseJson.result.bugs;

                        jQuery('#newBugzillaBugsPlaceholder').remove();

                        for (var bugIndex = 0, bugCount = bugs.length; bugIndex < bugCount; ++bugIndex) {
                            var bug = bugs[bugIndex];

                            if (bug.status == "NEW") {
                                var link = '<li><a href="' + bugzillaBaseUrl + bug.id + '">' + bug.summary + '</a></li>';
                                jQuery('#newBugzillaBugsItems').append(jQuery(link));
                            }
                        }
                    }
                });

            }
        });
    }, 0);

})();