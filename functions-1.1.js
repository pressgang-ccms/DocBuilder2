/**
 * The id of the Obsolete tag
 * @type {number}
 */
var OBSOLETE_TAG = 652;
var FROZEN_TAG = 669;
var ADD_STATE = 1;
var REMOVE_STATE = 2;

function changeLang() {
    var langSelect = document.getElementById("lang");
    changeLang(langSelect);
}

function changeLang(langSelect) {
    var lang = langSelect.options[langSelect.selectedIndex].value;
    if (lang != null) {
        if (lang == "") {
            window.location = getBaseURL();
        } else {
            window.location = getBaseURL() + lang + '/';
        }
    }
}

function getBaseURL() {
    return window.location.protocol + '//' + window.location.host + '/';
}

function getPageLanguage() {
    var baseURL = getBaseURL();
    var url = window.location.href;
    if (url == baseURL) {
        return "";
    } else {
        var urlNoBase = url.replace(baseURL, '');
        var index = urlNoBase.indexOf('/')
        return index == -1 ? urlNoBase : urlNoBase.substring(0, index);
    }
}

function setLangSelectLanguage() {
    var langSelect = document.getElementById("lang");
    var pageLang = getPageLanguage();
    setSelectedLang(langSelect, pageLang);
}

function setSelectedLang(langSelect, pageLang) {
    var langIndex = 0;
    for (var i = 0; i < langSelect.options.length; i++) {
        var option = langSelect.options[i];
        if (option.value == pageLang) {
            langIndex = i;
            break;
        }
    }
    langSelect.selectedIndex = langIndex;
}

/**
 * Adds the frozen tag to a spec
 * @param remove true if the tag is to be removed, false if it is to be added
 * @param restServer The PressGang REST server
 * @param id The spec id
 */
function freezeSpec(remove, restServer, id) {
    var postBody = '{"id":'+id+', "tags":{"items":[{"item":{"id":'+FROZEN_TAG+'}, "state":' + (remove ? REMOVE_STATE : ADD_STATE) + '}]},"configuredParameters":["tags"]}';
    jQuery.post( restServer + "/1/contentspec/update/json", postBody, function( data ) {
        window.alert("Content specifications " + id + " is now marked as frozen. This will be reflected when DocBuilder completes the next build cycle.\n" +
            "Use the frozen option in the filters at the top of the page to view or hide frozen content specifications.");
    });
}

/**
 * Adds the obsolete tag to a spec
 * @param remove true if the tag is to be removed, false if it is to be added
 * @param restServer The PressGang REST server
 * @param id The spec id
 */
function obsoleteSpec(remove, restServer, id) {
    var postBody = '{"id":'+id+', "tags":{"items":[{"item":{"id":'+OBSOLETE_TAG+'}, "state":' + (remove ? REMOVE_STATE : ADD_STATE) + '}]},"configuredParameters":["tags"]}';
    jQuery.post( restServer + "/1/contentspec/update/json", postBody, function( data ) {
        window.alert("Content specifications " + id + " is now marked as obsolete. This will be reflected when DocBuilder completes the next build cycle.\n" +
            "Use the obsolete option in the filters at the top of the page to view or hide frozen content specifications.");
    });
}

function build_table(data) {
    var columns = [
        {
            key: "id", label: "ID",
            allowHTML: true,
            sortFn: function (a, b, desc) {
                var first = a.get('idRaw'),
                    second = b.get('idRaw'),
                    order = (first == second) ? 0 : (first > second) ? 1 : -1;
                return desc ? -order : order;
            }
        },
        {
            key: "product",
            label: "Product",
            allowHTML: true,
            sortFn: function (a, b, desc) {
                var first = a.get('productRaw'),
                    second = b.get('productRaw'),
                    order = (first == second) ? 0 : (first > second) ? 1 : -1;
                return desc ? -order : order;
            }
        },
        {
            key: "version",
            label: "Version",
            allowHTML: true,
            sortFn: function (a, b, desc) {
                var first = a.get('versionRaw'),
                    second = b.get('versionRaw'), order = (first == second) ? 0 : (first > second) ? 1 : -1;
                return desc ? -order : order;
            }
        },
        {
            key: "title",
            label: "Title",
            allowHTML: true,
            sortFn: function (a, b, desc) {
                var first = a.get('titleRaw'),
                    second = b.get('titleRaw'),
                    order = (first == second) ? 0 : (first > second) ? 1 : -1;
                return desc ? -order : order;
            }
        },
        {
            key: "remarks",
            label: "Remarks",
            allowHTML: true
        },
        {
            key: "buildlog",
            label: "Build Log",
            allowHTML: true
        },
        {
            key: "publicanlog",
            label: "Publican Log",
            allowHTML: true
        },
        {
            key: "publicanbook",
            label: "Publican ZIP",
            allowHTML: true
        },
        {
            key: "status",
            label: "Status",
            allowHTML: true
        },
        {
            key: "freeze",
            label: "Freeze",
            allowHTML: true
        },
        {
            key: "obsolete",
            label: "Obsolete",
            allowHTML: true
        }
    ];
    var sortableColumns = ["id", "product", "title", "version"];
    abstract_build_table(data, columns, sortableColumns);
}

function build_table_with_pdfs(data) {
    var columns = [
        {
            key: "id", label: "ID",
            allowHTML: true,
            sortFn: function (a, b, desc) {
                var first = a.get('idRaw'),
                    second = b.get('idRaw'),
                    order = (first == second) ? 0 : (first > second) ? 1 : -1;
                return desc ? -order : order;
            }
        },
        {
            key: "product",
            label: "Product",
            allowHTML: true,
            sortFn: function (a, b, desc) {
                var first = a.get('productRaw'),
                    second = b.get('productRaw'),
                    order = (first == second) ? 0 : (first > second) ? 1 : -1;
                return desc ? -order : order;
            }
        },
        {
            key: "version",
            label: "Version",
            allowHTML: true,
            sortFn: function (a, b, desc) {
                var first = a.get('versionRaw'),
                    second = b.get('versionRaw'), order = (first == second) ? 0 : (first > second) ? 1 : -1;
                return desc ? -order : order;
            }
        },
        {
            key: "title",
            label: "Title",
            allowHTML: true,
            sortFn: function (a, b, desc) {
                var first = a.get('titleRaw'),
                    second = b.get('titleRaw'),
                    order = (first == second) ? 0 : (first > second) ? 1 : -1;
                return desc ? -order : order;
            }
        },
        {
            key: "pdfLink",
            label: "PDF Link",
            allowHTML: true
        },
        {
            key: "buildlog",
            label: "Build Log",
            allowHTML: true
        },
        {
            key: "publicanlog",
            label: "Publican Log",
            allowHTML: true
        },
        {
            key: "status",
            label: "Status",
            allowHTML: true
        }
    ];
    var sortableColumns = ["id", "product", "title", "version"];
    abstract_build_table(data, columns, sortableColumns);
}

/*
 * Builds a YUI 3 DataTable from the input data and places it at the end of the page. The table structure will be built
 * from the passed columns and sortable column arrays.
 */
function abstract_build_table(data, columns, sortableColumns) {

    var buildTable = function(filteredData) {
        var existingTableDiv = document.getElementById("table");
        if (existingTableDiv) {
            existingTableDiv.parentNode.removeChild(existingTableDiv);
        }

        var tableDiv = document.createElement("div");
        tableDiv.style.margineTop = "1em";
        tableDiv.className = "yui3-skin-sam";
        tableDiv.id = "table";
        document.body.appendChild(tableDiv);

        YUI().use('datatable', function (Y) {
            var table = new Y.DataTable({
                columns: columns,
                sortable: sortableColumns,
                data: filteredData
            });
            table.render("#table");
        });
    }

    var filteredData = [];

    var productFilter = localStorage["productFilter"];
    var titleFilter = localStorage["titleFilter"];
    var versionFilter = localStorage["versionFilter"];
    var idFilter = localStorage["idFilter"];
    var topicIDFilter = localStorage["topicIDFilter"];
    var specObsoleteFilter = localStorage["specObsoleteFilter"];
    var specFrozenFilter = localStorage["specFrozenFilter"];

    var topicIds = null;

    if (topicIDFilter != null && topicIDFilter.trim().match(/(\d+,)*\d+/)) {
        topicIds = topicIDFilter.split(",");
    }

    outerLoop:
    for (var i = 0, count = data.length; i < count; ++i) {
        if (productFilter != null && productFilter.length != 0 && !data[i].productRaw.toLowerCase().match(productFilter.toLowerCase())) {
            continue;
        }

        if (titleFilter != null && titleFilter.length != 0 && !data[i].titleRaw.toLowerCase().match(titleFilter.toLowerCase())) {
            continue;
        }

        if (versionFilter != null && versionFilter.length != 0 && !data[i].versionRaw.toLowerCase().match(versionFilter.toLowerCase())) {
            continue;
        }

        if (idFilter != null && idFilter.length != 0 && !String(data[i].idRaw).toLowerCase().match(idFilter.toLowerCase())) {
            continue;
        }

        if (specObsoleteFilter == null || specObsoleteFilter.toString().toLowerCase() == false.toString().toLowerCase()) {
            for (var tagIndex = 0, tagCount = data[i].tags.length; tagIndex < tagCount; ++tagIndex) {
                if (data[i].tags[tagIndex] == OBSOLETE_TAG) {
                    continue outerLoop;
                }
            }
        }

        if (specFrozenFilter == null || specFrozenFilter.toString().toLowerCase() == false.toString().toLowerCase()) {
            for (var tagIndex = 0, tagCount = data[i].tags.length; tagIndex < tagCount; ++tagIndex) {
                if (data[i].tags[tagIndex] == FROZEN_TAG) {
                    continue outerLoop;
                }
            }
        }

        filteredData.push(data[i]);
    }

    if (!topicIds) {
        buildTable(filteredData);
    } else {
        var specIds = [];
        var secondFilteredData = [];
        var queryStart = "http://topika.ecs.eng.bne.redhat.com:8080/pressgang-ccms/rest/1/contentspecnodes/get/json/query;csNodeType=0%2C9%2C10;csNodeEntityId="
        var queryEnd = "?expand=%7B%22branches%22%3A%5B%7B%22trunk%22%3A%7B%22name%22%3A%20%22nodes%22%7D%2C%20%22branches%22%3A%5B%7B%22trunk%22%3A%7B%22name%22%3A%20%22contentSpec%22%7D%7D%5D%7D%5D%7D";

        var topicsCount = topicIds.length;
        var completedQueries = 0;

        var secondFilter = function() {
            for (var i = 0, count = filteredData.length; i < count; ++i) {

                var found = false;
                for (var specIndex = 0, specCount = specIds.length; specIndex < specCount; ++specIndex)  {
                    if (String(filteredData[i].idRaw).match(specIds[specIndex].toString())) {
                        found = true;
                        break;
                    }
                }

                if (found) {
                    secondFilteredData.push(filteredData[i]);
                }
            }

            buildTable(secondFilteredData);
        }

        for (var topicIndex = 0; topicIndex < topicsCount; ++topicIndex) {
            $.getJSON(queryStart + topicIds[topicIndex] + queryEnd, function(data){
                ++completedQueries;

                for (var itemIndex = 0, itemCount = data.items.length; itemIndex < itemCount; ++itemIndex) {
                    var item = data.items[itemIndex].item;
                    var specId = item.contentSpec.id;
                    specIds.push(specId);
                }

                if (completedQueries == topicsCount) {
                    secondFilter();
                }
            });
        }
    }


}
