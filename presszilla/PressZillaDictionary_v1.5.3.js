/**
 * The id of the extended property that defines valid dictionary words
 * @type {number}
 */
var VALID_WORD_EXTENDED_PROPERTY_TAG_ID = 33;
/**
 * The id of the extended property that defines invalid dictionary words
 * @type {number}
 */
var INVALID_WORD_EXTENDED_PROPERTY_TAG_ID = 32;
/**
 * The id of the extended property that defines discourages dictionary words
 * @type {number}
 */
var DISCOURAGED_WORD_EXTENDED_PROPERTY_TAG_ID = 31;
/**
 * The id of the extended property that defines discourages dictionary phrases
 * @type {number}
 */
var DISCOURAGED_PHRASE_EXTENDED_PROPERTY_TAG_ID = 33;
/**
 * List of element ids to skip when looking for text nodes
 * @type {Array}
 */
var SKIP_IDS = ["tinymce"];
/**
 * List of element to skip when looking for text nodes
 * @type {Array}
 */
var SKIP_ELEMENTS = ["A"];
/**
 * The server hostname and port
 * @type {string}
 */
var BASE_SERVER =  "topika.ecs.eng.bne.redhat.com:8080";
/**
 * The server that hosts the UI we want to connect to.
 * @type {string}
 */
var SERVER = "http://" + BASE_SERVER + "/pressgang-ccms/rest/1";
/**
 * a map of topic ids to html file names
 * @type {Array}
 */
var dictionaryBookTopics = null;

/**
 * This will be called by the dictionary content spec pressgang_website.js file
 * @param data a map of topic ids to html file names
 */
function pressgang_website_callback(data) {
    dictionaryBookTopics = data;
}

jQuery( document ).ready(function() {
    var texts = [];
    collectTextNodes(document.body, texts);

    var customDicUrl = SERVER + "/topics/get/json/query;propertyTagExists" + VALID_WORD_EXTENDED_PROPERTY_TAG_ID + "=true;propertyTagExists" + INVALID_WORD_EXTENDED_PROPERTY_TAG_ID + "=true;propertyTagExists" + DISCOURAGED_WORD_EXTENDED_PROPERTY_TAG_ID + "=true;propertyTagExists" + DISCOURAGED_PHRASE_EXTENDED_PROPERTY_TAG_ID + "=true;logic=Or?expand=%7B%22branches%22%3A%5B%7B%22trunk%22%3A%22topics%22%2C%22branches%22%3A%5B%7B%22trunk%22%3A%7B%22name%22%3A+%22properties%22%7D%7D%5D%7D%5D%7D";

    setTimeout(function() {
        GM_xmlhttpRequest({
            method: 'GET',
            url: customDicUrl,
            onabort: function() {},
            onerror: function() {},
            ontimeout: function() {},
            onload: function(topicsRaw) {
                    var topics = JSON.parse(topicsRaw.responseText);
                    var customWordsDict = {};

                    for (var topicIndex = 0, topicCount = topics.items.length; topicIndex < topicCount; ++topicIndex) {
                        var topic =  topics.items[topicIndex].item;

                        for (var propertyIndex = 0, propertyCount = topic.properties.items.length; propertyIndex < propertyCount; ++propertyIndex) {
                            var property = topic.properties.items[propertyIndex].item;

                            if (property.id == VALID_WORD_EXTENDED_PROPERTY_TAG_ID ||
                                INVALID_WORD_EXTENDED_PROPERTY_TAG_ID ||
                                DISCOURAGED_WORD_EXTENDED_PROPERTY_TAG_ID ||
                                DISCOURAGED_PHRASE_EXTENDED_PROPERTY_TAG_ID) {
                                if (!customWordsDict[property.value]) {
                                    customWordsDict[property.value] = {tagId: property.id, id: topic.id};
                                }
                            }
                        }
                    }

                    addDictionaryPopovers(customWordsDict);

            }
        })
    }, 0);
});

function collectTextNodes(element, texts) {
    if (jQuery.inArray(element.id, SKIP_IDS) == -1) {
        if (jQuery.inArray(element.nodeName, SKIP_ELEMENTS) == -1) {
            for (var child= element.firstChild; child!==null; child= child.nextSibling) {
                if (child.nodeType===3)
                    texts.push(child);
                else if (child.nodeType===1)
                    collectTextNodes(child, texts);
            }
        }
    }
}

/**
 * Scan the text in the page for any words that match those in the custom dictionary, and add a popover icon.
 */
function addDictionaryPopovers(customWordsDict) {

    // create an array that sorts the keys in the customWordsDict by length
    var customWordsKeyset = [];
    for (var customWord in customWordsDict) {
        customWordsKeyset.push(customWord);
    }

    customWordsKeyset.sort(function(a, b){
        if (a.length > b.length) {
            return -1;
        }

        if (a.length == b.length) {
            return 0;
        }

        return 1;
    });

    var texts = [];
    collectTextNodes(document.body, texts);

    var batchsize = 20;

    function processTextNodes(texts, index) {
        if (index < texts.length) {
            for (var textIndex = index, textCount = texts.length; textIndex < textCount && textIndex < index + batchsize; ++textIndex) {
                var textNode = texts[textIndex];
                var fixedText = textNode.textContent;

                // mark up the dictionary matches
                for (var customWordIndex = 0, customWordCount = customWordsKeyset.length; customWordIndex < customWordCount; ++customWordIndex) {
                    var replacementMarkers = {};

                    // Go through and replace all previously matches text with markers
                    var spanRE = /\<span.*?\<\/span\>/;
                    var spanMatch = null;
                    while ((spanMatch = fixedText.match(spanRE)) != null) {
                        var replacementString = "[" + (Math.random() * 1000) + "]";

                        while (fixedText.indexOf(replacementString) != -1) {
                            replacementString = "[" + (Math.random() * 1000) + "]";
                        }

                        fixedText = fixedText.replace(spanRE, replacementString);
                        replacementMarkers[replacementString] = spanMatch[0];
                    }

                    var customWord = customWordsKeyset[customWordIndex];
                    var customWordDetails = customWordsDict[customWord];
                    var borderStyle = "";
                    if (customWordDetails.tagId == VALID_WORD_EXTENDED_PROPERTY_TAG_ID) {
                        borderStyle = "border-color: green";
                    } else if (customWordDetails.tagId == INVALID_WORD_EXTENDED_PROPERTY_TAG_ID) {
                        borderStyle = "border-color: red";
                    } else if (customWordDetails.tagId == DISCOURAGED_WORD_EXTENDED_PROPERTY_TAG_ID) {
                        borderStyle = "border-color: purple";
                    } else if (customWordDetails.tagId == DISCOURAGED_PHRASE_EXTENDED_PROPERTY_TAG_ID) {
                        borderStyle = "border-color: purple";
                    }
                    fixedText = fixedText.replace(new RegExp("\\b" + encodeRegex(customWord) + "\\b", "g"), "<span style='text-decoration: none; border-bottom: 1px dashed; " + borderStyle + "' onclick='javscript:displayDictionaryTopic(" + customWordDetails.id + ")'>" + customWord + "</span>");

                    // replace the markers with the original text
                    for (var replacement in replacementMarkers) {
                        fixedText = fixedText.replace(replacement, replacementMarkers[replacement]);
                    }
                }

                jQuery(textNode).replaceWith(fixedText);
            }

            setTimeout(function() {
                processTextNodes(texts, index + batchsize);
            }, 0);
        }
    }

    processTextNodes(texts, 0);
}

unsafeWindow.displayDictionaryTopic = function(topicId) {
    if (dictionaryBookTopics) {
        for (var dicIndex = 0, dicCount = dictionaryBookTopics.length; dicIndex < dicCount; ++dicIndex) {
            var dicItem = dictionaryBookTopics[dicIndex];
            if (dicItem.topicId == topicId) {
                window.open("http://docbuilder.ecs.eng.bne.redhat.com/22516/html/" + dicItem.target + ".html","PressGangDictWindow","config='toolbar=no, menubar=no,scrollbars=no,resizable=no,location=no,directories=no,atus=no,width=640,height=480'");
                break;
            }
        }
    }
}

function encodeRegex(text) {
    text = text.replace(/\\/g, "\\\\");
    text = text.replace(/\./g, "\\.");
    text = text.replace(/\+/g, "\\+");
    text = text.replace(/\-/g, "\\-");
    text = text.replace(/\*/g, "\\*");
    text = text.replace(/\?/g, "\\?");
    text = text.replace(/\[/g, "\\[");
    text = text.replace(/\]/g, "\\]");
    text = text.replace(/\^/g, "\\^");
    text = text.replace(/\$/g, "\\$");
    text = text.replace(/\(/g, "\\(");
    text = text.replace(/\)/g, "\\)");
    text = text.replace(/\{/g, "\\{");
    text = text.replace(/\}/g, "\\}");
    text = text.replace(/\=/g, "\\=");
    text = text.replace(/\!/g, "\\!");
    text = text.replace(/\</g, "\\<");
    text = text.replace(/\>/g, "\\>");
    text = text.replace(/\|/g, "\\|");
    text = text.replace(/\:/g, "\\:");
    return text;
}