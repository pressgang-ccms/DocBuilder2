/*
 * Copyright 2011-2014 Red Hat, Inc.
 *
 * This file is part of PressGang CCMS.
 *
 * PressGang CCMS is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Lesser General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * PressGang CCMS is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License
 * along with PressGang CCMS. If not, see <http://www.gnu.org/licenses/>.
 */

var ADD_STATE = 1;
var REMOVE_STATE = 2;
var LOCALE_URL_PARAM_KEY = "locale";

/*
 Extract the query params
 */
var urlParams;
(window.onpopstate = function () {
    var match,
        pl     = /\+/g,  // Regex for replacing addition symbol with a space
        search = /([^&=]+)=?([^&/]*)/g,
        decode = function (s) { return decodeURIComponent(s.replace(pl, " ")); },
        query  = window.location.search.substring(1);

    urlParams = {};
    while (match = search.exec(query))
        urlParams[decode(match[1])] = decode(match[2]);
})();

function changeLang(langSelect) {
    var lang = langSelect.options[langSelect.selectedIndex].value;
    if (lang != null) {
        if (lang == "") {
            window.location = getBaseURL();
        } else {
            window.location = getBaseURL() + '?locale=' + lang;
        }
    }
}

function getBaseURL() {
    var url = new URL(window.location.toString());
    return url.protocol + "//" + url.host + url.pathname;
}

function getPageLanguage() {
    return urlParams[LOCALE_URL_PARAM_KEY] || "";
}

function isTranslated() {
    return getPageLanguage().length !== 0;
}

function setSelectedLang() {
    var pageLang = getPageLanguage();
    var langSelect = jQuery("#locales")[0];
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
 * Opens a window to the user interface to allow the user to freeze a content spec.
 *
 * @param uiUrl The PressGang UI url for content specs.
 * @param id The spec id
 */
function freezeSpec(uiUrl, id) {
    window.open(uiUrl + ";id=" + id + ";action=freeze;", "_blank");
}

/**
 * Adds the obsolete tag to a spec
 * @param remove true if the tag is to be removed, false if it is to be added
 * @param restServer The PressGang REST server
 * @param id The spec id
 */
function obsoleteSpec(remove, restServer, id) {
    var postBody = '{"id":'+id+', "tags":{"items":[{"item":{"id":' + OBSOLETE_TAG + '}, "state":' + (remove ? REMOVE_STATE : ADD_STATE) + '}]},"configuredParameters":["tags"]}';

    jQuery.ajax({
        url:restServer + "1/contentspec/update/json",
        type:"POST",
        data:postBody,
        contentType:"application/json",
        dataType:"json",
        success: function(){
            if (remove) {
                window.alert("Content specifications " + id + " is now not marked as obsolete. This will be reflected when DocBuilder completes the next build cycle.\n\n" +
                    "Use the obsolete option in the filters at the top of the page to view or hide obsolete content specifications.");
            } else {
                window.alert("Content specifications " + id + " is now marked as obsolete. This will be reflected when DocBuilder completes the next build cycle.\n\n" +
                    "Use the obsolete option in the filters at the top of the page to view or hide obsolete content specifications.");
            }
        }
    });
}

function sortByProductAndVersion(a,b) {
    if (!a.productRaw && b.productRaw) {
        return -1;
    }

    if (a.productRaw && !b.productRaw) {
        return 1;
    }

    if (a.productRaw.toLowerCase() < b.productRaw.toLowerCase()) {
        return -1;
    }

    if (a.productRaw.toLowerCase() > b.productRaw.toLowerCase()) {
        return 1;
    }

    if (!a.versionRaw && b.versionRaw) {
        return -1;
    }

    if (a.versionRaw && !b.versionRaw) {
        return 0;
    }

    if (a.versionRaw < b.versionRaw) {
        return -1;
    }

    if (a.versionRaw > b.versionRaw) {
        return 1;
    }

    return 0;
}

function sortByTitle(a,b) {
    if (!a.titleRaw && b.titleRaw) {
        return -1;
    }

    if (a.titleRaw && !b.titleRaw) {
        return 0;
    }

    if (a.titleRaw.toLowerCase() < b.titleRaw.toLowerCase()) {
        return -1;
    }

    if (a.titleRaw.toLowerCase() > b.titleRaw.toLowerCase()) {
        return 1;
    }

    return 0;
}

function sortByID(a,b) {
    if (!a.idRaw && b.idRaw) {
        return -1;
    }

    if (a.idRaw && !b.idRaw) {
        return 0;
    }

    if (a.idRaw < b.idRaw) {
        return -1;
    }

    if (a.idRaw > b.idRaw) {
        return 1;
    }

    return 0;
}

function isVarUndefined(variable) {
    return typeof variable === 'undefined';
}

/**
 * A number of variables are expected to be defined in the data.js file. If these are no present,
 * we can not process the specs.
 * @returns {*}
 */
function checkAllDataJSVarsDefined() {
    return typeof TO_BE_SYNCED_LABEL !== 'undefined' &&
        typeof OPEN_LINK_ID_MARKER !== 'undefined' &&
        typeof UI_URL !== 'undefined' &&
        typeof EDIT_LINK !== 'undefined' &&
        typeof REST_SERVER !== 'undefined' &&
        typeof OPEN_LINK !== 'undefined';
}

function filterData(data) {
    jQuery("#noBooks").hide();
    jQuery("#noBooksAtAll").hide();
    jQuery("#booklistright").empty();
    jQuery("#booklistleft").empty();

    if (typeof buildTime !== 'undefined') {
        var minutes = (buildTime / 60).toFixed(1);
        jQuery("#rebuildTimeValue").text("Estimated Rebuild Time: " + minutes + " minutes");
        jQuery("#rebuildTime").show();
    }

    if (!data || data.length === 0) {
        jQuery("#noBooksAtAll").show();
    } else if (!checkAllDataJSVarsDefined()) {
        console.log("Some variables that were expected to be defined in the config.js file are undefined.");
        jQuery("#noBooksAtAll").show();
    } else {
        // get the filter details
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

        // find the books that match the criteria
        var productAndVersionBooks = _.filter(data, function (bookElement) {

            if (versionFilter && versionFilter.length != 0 && !bookElement.versionRaw.toLowerCase().match(versionFilter.toLowerCase())) {
                return false;
            }

            if (productFilter && productFilter.length != 0 && !bookElement.productRaw.toLowerCase().match(productFilter.toLowerCase())) {
                return false;
            }

            if (titleFilter && titleFilter.length != 0 && !bookElement.titleRaw.toLowerCase().match(titleFilter.toLowerCase())) {
                return false;
            }

            if (idFilter && idFilter.length != 0 && !String(bookElement.idRaw).toLowerCase().match(idFilter.toLowerCase())) {
                return false;
            }

            /*
                Books have some default data before a complete sync has been processed. We don't display books
                without proper title, product and version info.
             */
            if (bookElement.versionRaw === TO_BE_SYNCED_LABEL ||
                bookElement.productRaw === TO_BE_SYNCED_LABEL ||
                bookElement.titleRaw === TO_BE_SYNCED_LABEL) {
                return false;
            }

            if (bookElement.tags) {
                if (!specObsoleteFilter || specObsoleteFilter.toString().toLowerCase() == false.toString().toLowerCase()) {
                    if (bookElement.tags.indexOf(OBSOLETE_TAG) !== -1) {
                        return false;
                    }
                }

                if (!specFrozenFilter || specFrozenFilter.toString().toLowerCase() == false.toString().toLowerCase()) {
                    if (bookElement.tags.indexOf(FROZEN_TAG) !== -1) {
                        return false;
                    }
                }
            }

            return true;
        });

        if (!topicIds) {
            displayTable(productAndVersionBooks);
        } else {
            var queryStart = REST_SERVER + "1/topics/get/json/query;topicIds=";
            var queryEnd = "?expand=%7B%22branches%22%3A%5B%7B%22trunk%22%3A%7B%22name%22%3A%20%22topics%22%7D%2C%20%22branches%22%3A%5B%7B%22trunk%22%3A%7B%22name%22%3A%20%22contentSpecs_OTM%22%7D%7D%5D%7D%5D%7D";

            $.getJSON(queryStart + topicIds.join(",") + queryEnd, function (data) {

                var specIds = [];
                for (var itemIndex = 0, itemCount = data.items.length; itemIndex < itemCount; ++itemIndex) {
                    var item = data.items[itemIndex].item;
                    var specs = item.contentSpecs_OTM;

                    for (var specItemIndex = 0, specItemCount = specs.items.length; specItemIndex < specItemCount; ++specItemIndex) {
                        var spec = specs.items[specItemIndex].item;
                        specIds.push(spec.id.toString());
                    }
                }

                productAndVersionBooks = _.filter(productAndVersionBooks, function (element) {
                    return specIds.indexOf(element.idRaw.toString()) !== -1;
                });

                displayTable(productAndVersionBooks);
            });
        }
    }
}

function dedupeProdAndVersion(productsAndVersions) {
    productsAndVersions = _.map(productsAndVersions, function(element) {
        return {productRaw: element.productRaw, versionRaw: element.versionRaw};
    });

    productsAndVersions = _.uniq(productsAndVersions, function(element) {
        return JSON.stringify(element);
    });

    return productsAndVersions;
}

function getCollapseTitleStateClass(visible) {
    return visible === "true" ? "" : "collapsed";
}

function getCollapseStateClass(visible) {
    return visible === "true" ? "collapse in" : "collapse";
}

function getCollapseTitleState(productName, versionName) {
   return getCollapseTitleStateClass(localStorage['group_' + _.escape(productName) + '_' + _.escape(versionName)]);
}

function getCollapseState(productName, versionName) {
    return getCollapseStateClass(localStorage['group_' + _.escape(productName) + '_' + _.escape(versionName)]);
}

/*
 * We need to clean up the time stamps used in the data.js files so moment.js will recognise it.
 */
function fixUpCompileTime(timeString) {
    var lastBuildMatch = /(\d{4}-\d{2}-\d{2}T)\s?(\d{1,2})(:\d{1,2}:\d{2}\.\d{3}[\+\-](\d{4}|\d{2}:\d{2}))/.exec(timeString);
    if (lastBuildMatch) {
        var fixedDate = decodeURIComponent(lastBuildMatch[1] + (lastBuildMatch[2].length === 1 ? "0" : "") + lastBuildMatch[2] + lastBuildMatch[3]);
        return moment(fixedDate).format("dddd, MMMM Do YYYY, h:mm:ss a");
    }

    return "Unknown";
}

function displayTable(productAndVersionBooks) {
    var productsAndVersions = dedupeProdAndVersion(productAndVersionBooks);

    productsAndVersions.sort(sortByProductAndVersion);

    var count = 0;
    var matchingBookCount = _.reduce(productsAndVersions, function (memo, element) {
        var thisProductAndVersionBooks = _.filter(productAndVersionBooks, function (bookElement) {
            return bookElement.productRaw === element.productRaw &&
                bookElement.versionRaw === element.versionRaw;
        });

        // Sort the list of product/versions
        if (localStorage["sortBy"] === "ID") {
            thisProductAndVersionBooks.sort(sortByID);
        } else {
            thisProductAndVersionBooks.sort(sortByTitle);
        }

        var versionName = !element.versionRaw ? "" : element.versionRaw.trim();
        var productName = !element.productRaw ? "No Product" : element.productRaw.trim();
        var elementId = "product-list-" + count++;

        var productAndVersionHeading = jQuery(
                '<div>\
                     <h1 class="collapse-title">\
                         <a data-toggle="collapse" data-target="#' + elementId + '" class="' + getCollapseTitleState(productName, versionName) + '">' + _.escape(productName) + ' ' + _.escape(versionName) + '</a>\
                     </h1>\
             </div>');


        var bookList = jQuery('<div id="' + elementId + '" class="panel-collapse ' + getCollapseState(productName, versionName) + '"></div>');
        productAndVersionHeading.append(bookList);

        // Save the state of the collapsible groups
        bookList.on('shown.bs.collapse', function () {
            localStorage['group_' + _.escape(productName) + '_' + _.escape(versionName)] = true
        });
        bookList.on('hidden.bs.collapse', function () {
            localStorage['group_' + _.escape(productName) + '_' + _.escape(versionName)] = false
        });

        // Build each books listing element and add it to the book list
        _.each(thisProductAndVersionBooks, function (bookElement, index, list) {
            var title = !bookElement.titleRaw ? "No Title" : bookElement.titleRaw.trim();

            var bookListing = isTranslated() ? buildBookTranslationElement(bookElement, title) : buildBookElement(bookElement, title);
            bookList.append(bookListing);
        });

        if (thisProductAndVersionBooks.length !== 0) {
            if (memo < productsAndVersions.length / 2) {
                jQuery("#booklistleft").append(productAndVersionHeading);
            } else {
                jQuery("#booklistright").append(productAndVersionHeading);
            }

            // Add one to count for the heading
            return ++memo;
        } else {
            return memo;
        }
    }, 0);

    if (matchingBookCount === 0) {
        jQuery("#noBooks").show();
    }
}

function buildBookTranslationElement(bookElement, title) {
    var baseDir = OPEN_LOCALE_LINK.replace(OPEN_LINK_LOCALE_MARKER, getPageLanguage()).replace(OPEN_LINK_ID_MARKER, bookElement.idRaw);
    var editLink = EDIT_LINK.replace(OPEN_LINK_ID_MARKER, bookElement.idRaw);

    var docbuilderLink = '';
    var menuDocbuilderLink = '';
    var menuDocbuilderRemarksLink = '';
    var lastBuild = '';
    var menuPdfLink = '';
    var menuPublicanZipLink = '';
    var menuViewPublicanLog = '<li><a href="' + baseDir + 'build.log">View Build Log</a></li>';
    var menuViewBuildLog = '<li><a href="' + baseDir + 'publican.log">View Publican Log</a></li>';
    var statusIcon = getStatusIcon(bookElement);

    if (isBuildOk(bookElement)) {
        docbuilderLink = '<a href="' + baseDir + '">' + _.escape(title) + '</a>';
        menuDocbuilderLink = '<li><a href="' + baseDir + '">View Build</a></li>'
        menuDocbuilderRemarksLink = '<li><a href="' + baseDir + 'remarks/">View Build With Remarks</a></li>';;
        lastBuild = fixUpCompileTime(bookElement.lastcompile);

        if (bookElement.pdfFileName) {
            menuPdfLink = '<li><a href="' + baseDir + bookElement.pdfFileName + '">View PDF</a></li>';
        } else {
            menuPdfLink = '<li role="presentation" class="disabled"><a role="menuitem">No PDF Available</a></li>';
        }

        if (bookElement.publicanbook && bookElement.publicanbook !== '/books/') {
            menuPublicanZipLink = '<li><a href=\"' + bookElement.publicanbook + '\">Publican ZIP</a></li>';
        } else {
            menuPublicanZipLink = '<li role="presentation" class="disabled"><a role="menuitem">No ZIP Available</a></li>';
        }
    } else {
        docbuilderLink = '<span>' + _.escape(title) + '</span>';
        menuDocbuilderLink = '<li role="presentation" class="disabled"><a role="menuitem">No Build Available</a></li>';
        menuDocbuilderRemarksLink = '<li role="presentation" class="disabled"><a role="menuitem">No Build With Remarks Available</a></li>';
        menuPdfLink = '<li role="presentation" class="disabled"><a role="menuitem">No PDF Available</a></li>';
        menuPublicanZipLink = '<li role="presentation" class="disabled"><a role="menuitem">No ZIP Available</a></li>';
        lastBuild = "Unknown";
    }

    return jQuery(
        '<div> \
            <h2 class="bookTitle"> \
            <span title="Last Built: ' + _.escape(lastBuild) + '">\
                            [<a href="' + editLink + '">' + _.escape(bookElement.idRaw) + '</a>] \
                            ' + docbuilderLink + '\
                            ' + statusIcon + '\
                    </span> \
                    <div class="btn-group bookMenu"> \
                        <button type="button" class="btn btn-default dropdown-toggle" data-toggle="dropdown"> \
                            <span class="fa fa-angle-down"></span> \
                        </button> \
                        <ul class="dropdown-menu" role="menu"> \
                            ' + menuDocbuilderLink + '\
                            ' + menuDocbuilderRemarksLink + '\
                            ' + menuPdfLink + ' \
                            ' + menuViewPublicanLog + ' \
                            ' + menuViewBuildLog + ' \
                            ' + menuPublicanZipLink + '\
                        </ul> \
                    </div> \
                    </h2> \
                </div>');
}

function buildBookElement(bookElement, title) {
    var baseDir = OPEN_LINK.replace(OPEN_LINK_LOCALE_MARKER, getPageLanguage()).replace(OPEN_LINK_ID_MARKER, bookElement.idRaw);
    var editLink = EDIT_LINK.replace(OPEN_LINK_ID_MARKER, bookElement.idRaw);

    var docbuilderLink = '';
    var menuDocbuilderLink = '';
    var menuDocbuilderRemarksLink = '';
    var menuPublicanZipLink = '';
    var lastBuild = '';
    var menuEditSpec = '<li><a href="' + editLink + '">Edit Spec</a></li>';
    var menuViewPublicanLog = '<li><a href="' + baseDir + 'build.log">View Build Log</a></li>';
    var menuViewBuildLog = '<li><a href="' + baseDir + 'publican.log">View Publican Log</a></li>';
    var statusIcon = getStatusIcon(bookElement);

    if (isBuildOk(bookElement)) {
        if (bookElement.publicanbook && bookElement.publicanbook !== '/books/') {
            menuPublicanZipLink = '<li><a href=\"' + bookElement.publicanbook + '\">Publican ZIP</a></li>';
        } else {
            menuPublicanZipLink = '<li role="presentation" class="disabled"><a role="menuitem">No ZIP Available</a></li>';
        }

        lastBuild = fixUpCompileTime(bookElement.lastcompile);
        docbuilderLink = '<a href="' + baseDir + '">' + _.escape(title) + '</a>';
        menuDocbuilderLink = '<li><a href="' + baseDir + '">View Build</a></li>';
        menuDocbuilderRemarksLink = '<li><a href="' + baseDir + 'remarks/">View Build With Remarks</a></li>';

    } else {
        lastBuild = "Unknown"
        menuPublicanZipLink = '<li role="presentation" class="disabled"><a role="menuitem">No ZIP Available</a></li>';
        docbuilderLink = '<span>' + _.escape(title) + '</span>';
        menuDocbuilderLink = '<li role="presentation" class="disabled"><a role="menuitem">No Build Available</a></li>';
        menuDocbuilderRemarksLink = '<li role="presentation" class="disabled"><a role="menuitem">No Build With Remarks Available</a></li>';
    }

    // Build up the freeze option
    var menuFreezeSpec = '';
    if (bookElement.tags && bookElement.tags.indexOf(FROZEN_TAG) !== -1) {
        menuFreezeSpec = '<li class="disabled"><a role="menuitem">Frozen</a></li>';
    } else {
        menuFreezeSpec = '<li><a href="javascript:void(0)" onclick="javascript:freezeSpec(\'' + UI_URL + '#ContentSpecFilteredResultsAndContentSpecView\', ' + bookElement.idRaw + ')">Freeze Spec</a></li>';
    }

    // Build up the obsolete option
    var menuObsoleteSpec = '';
    if (bookElement.tags && bookElement.tags.indexOf(OBSOLETE_TAG) !== -1) {
        menuObsoleteSpec = '<li><a href="javascript:void(0)" onclick="javascript:obsoleteSpec(true, \'' + REST_SERVER + '\', ' + bookElement.idRaw + ')">Unobsolete Spec</a></li>';
    } else {
        menuObsoleteSpec = '<li><a href="javascript:void(0)" onclick="javascript:obsoleteSpec(false, \'' + REST_SERVER + '\', ' + bookElement.idRaw + ')">Obsolete Spec</a></li>';
    }

    return jQuery(
        '<div> \
            <h2 class="bookTitle"> \
            <span title="Last Built: ' + _.escape(lastBuild) + '">\
                            [<a href="' + editLink + '">' + _.escape(bookElement.idRaw) + '</a>] \
                            ' + docbuilderLink + '\
                            ' + statusIcon + '\
                    </span> \
                    <div class="btn-group bookMenu"> \
                        <button type="button" class="btn btn-default dropdown-toggle" data-toggle="dropdown"> \
                            <span class="fa fa-angle-down"></span> \
                        </button> \
                        <ul class="dropdown-menu" role="menu"> \
                            ' + menuDocbuilderLink + '\
                            ' + menuDocbuilderRemarksLink + '\
                            ' + menuEditSpec + '\
                            ' + menuViewPublicanLog + ' \
                            ' + menuViewBuildLog + ' \
                            ' + menuFreezeSpec + '\
                            ' + menuObsoleteSpec + '\
                            ' + menuPublicanZipLink + ' \
                        </ul> \
                    </div> \
                    </h2> \
                </div>');
}

function isBuildOk(bookElement) {
    return bookElement.status && bookElement.status.indexOf("success") !== -1;
}

function getStatusIcon(bookElement) {
    if (bookElement.status && bookElement.status === "success") {
        return '<span class="pficon pficon-ok bookStatus"></span>';
    } else {
        return '<span class="pficon-layered bookStatus"><span class="pficon pficon-error-octagon"></span><span class="pficon pficon-error-exclamation"></span></span>';
    }
}

function settingIsTrue(setting) {
    return setting && setting.toLowerCase() == true.toString().toLowerCase();
}

function checkBoxWithSavedValue(checkbox, setting) {
    checkbox.prop('checked', settingIsTrue(setting));
}

function isChecked(checkbox) {
    return checkbox.prop('checked');
}

var rebuildTimeout = null;

function initFilter() {
    jQuery("#productFilter").val(localStorage["productFilter"] || "");
    jQuery("#titleFilter").val(localStorage["titleFilter"] || "");
    jQuery("#versionFilter").val(localStorage["versionFilter"] || "");
    jQuery("#idFilter").val(localStorage["idFilter"] || "");
    jQuery("#topicIDFilter").val(localStorage["topicIDFilter"] || "");
    checkBoxWithSavedValue(jQuery("#specObsoleteFilter"), localStorage["specObsoleteFilter"]);
    checkBoxWithSavedValue(jQuery("#specFrozenFilter"), localStorage["specFrozenFilter"]);
    jQuery("#sortBy").val(localStorage["sortBy"] || "Title");

    if (!isTranslated()) {
        jQuery("#frozenAndObsoleteOptions").show();
    }
}

function save_filter() {
    localStorage["productFilter"] = jQuery("#productFilter").val();
    localStorage["titleFilter"] = jQuery("#titleFilter").val();
    localStorage["versionFilter"] = jQuery("#versionFilter").val();
    localStorage["idFilter"] = jQuery("#idFilter").val();
    localStorage["topicIDFilter"] = jQuery("#topicIDFilter").val();
    localStorage["specObsoleteFilter"] = isChecked(jQuery("#specObsoleteFilter"));
    localStorage["specFrozenFilter"] = isChecked(jQuery("#specFrozenFilter"));
    localStorage["sortBy"] = jQuery("#sortBy").val();
    if (rebuildTimeout) {
        window.clearTimeout(rebuildTimeout);
        rebuildTimeout = null;
    }
    rebuildTimeout = setTimeout(function(){
        filterData(data);
        rebuildTimeout = null;
    },1000);
}
function reset_filter() {
    localStorage["productFilter"] = "";
    localStorage["titleFilter"] = "";
    localStorage["versionFilter"] = "";
    localStorage["idFilter"] = "";
    localStorage["topicIDFilter"] = "";
    localStorage["specObsoleteFilter"] = "";
    localStorage["specFrozenFilter"] = "";
    localStorage["sortBy"] = "";
    jQuery("#productFilter").val("");
    jQuery("#titleFilter").val("");
    jQuery("#versionFilter").val("");
    jQuery("#idFilter").val("");
    jQuery("#topicIDFilter").val("");
    checkBoxWithSavedValue(jQuery("#specObsoleteFilter"), false);
    checkBoxWithSavedValue(jQuery("#specFrozenFilter"), false);
    jQuery("#sortBy").selectpicker("val", "Title");
    if (rebuildTimeout) {
        window.clearTimeout(rebuildTimeout);
        rebuildTimeout = null;
    }
    filterData(data);
}