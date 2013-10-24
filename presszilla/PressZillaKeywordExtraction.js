/**
 * Gets the keywords for a topic
 * @param topicId The topic id
 * @param successCallback The function to call with the topic
 * @param failureCallback The function to call if the topic could not be retrieved
 */
function fetchKeywords(topicId, successCallback, failureCallback) {
    if (!solutionsCache[topicId].fetchingKeywords) {

        logToConsole("Getting topic keywords");

        // make a note that we have started processing this topic
        solutionsCache[topicId].fetchingKeywords = true;

        var specId = unsafeWindow.getSpecIdFromURL();
        var specProductUrl = "http://topika.ecs.eng.bne.redhat.com:8080/pressgang-ccms/rest/1/contentspecnodes/get/json/query;csNodeType=7;contentSpecIds=" + specId + "?expand=" + encodeURIComponent("{\"branches\":[{\"trunk\":{\"name\": \"nodes\"}}]}");

        // see http://stackoverflow.com/questions/11007605/gm-xmlhttprequest-why-is-it-never-firing-the-onload-in-firefox
        // and http://wiki.greasespot.net/0.7.20080121.0_compatibility
        setTimeout(function(){
            GM_xmlhttpRequest({
                method: 'GET',
                url: specProductUrl,
                onabort: function() {failureCallback("onabort"); },
                onerror: function() {failureCallback("onerror");},
                //onprogress: function() {logToConsole("onprogress");},
                //onreadystatechange: function() {logToConsole("onreadystatechange");},
                ontimeout: function() {failureCallback("ontimeout");},
                onload: function(specNodesResponse) {
                    var nodes = JSON.parse(specNodesResponse.responseText);
                    var product = "";
                    for (var nodeIndex = 0, nodeCount = nodes.items.length; nodeIndex < nodeCount; ++nodeIndex) {
                        var node = nodes.items[nodeIndex].item;
                        if (node.title == "Product") {
                            var product = node.additionalText;
                            break;
                        }
                    }

                    var additionalKeywords = product.split(" ");

                    var topicKeywordUrl = "http://topika.ecs.eng.bne.redhat.com:8080/pressgang-ccms/rest/1/topic/get/json/" + unsafeWindow.eventDetails.topicId + "?expand=%7B%22branches%22%3A%5B%7B%22trunk%22%3A%7B%22name%22%3A+%22keywords%22%7D%7D%5D%7D"

                    GM_xmlhttpRequest({
                        method: 'GET',
                        url: topicKeywordUrl,
                        onabort: function() {failureCallback("onabort"); },
                        onerror: function() {failureCallback("onerror");},
                        //onprogress: function() {logToConsole("onprogress");},
                        //onreadystatechange: function() {logToConsole("onreadystatechange");},
                        ontimeout: function() {failureCallback("ontimeout");},
                        onload: function(topicResponse) {
                            var topic = JSON.parse(topicResponse.responseText);
                            topic.keywords = additionalKeywords.concat(topic.keywords);
                            successCallback(topic);
                        }
                    });
                }
            });
        }, 0);
    }
}