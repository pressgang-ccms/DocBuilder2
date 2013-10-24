// ==UserScript==
// @name        PressZilla
// @namespace   https://www.jboss.org/pressgang
// @description PressGang BugZilla customization
// @author      Matthew Casperson
// @include     https://bugzilla.redhat.com/*
// @include     http://docbuilder.usersys.redhat.com/*
// @include     http://docbuilder.ecs.eng.bne.redhat.com/*
// @require     http://code.jquery.com/jquery-2.0.3.min.js
// @require     http://docbuilder.ecs.eng.bne.redhat.com/presszilla/PressZillaKeywordExtraction.js
// @require     http://docbuilder.ecs.eng.bne.redhat.com/presszilla/PressZillaBugzillaIntegration.js
// @require     http://docbuilder.ecs.eng.bne.redhat.com/presszilla/PressZillaSolutionsIntegration.js
// @version     1.9
// @grant       GM_xmlhttpRequest
// @grant       unsafeWindow
// @downloadURL http://docbuilder.usersys.redhat.com/PressZilla.user.js
// @updateURL   http://docbuilder.usersys.redhat.com/PressZilla.meta.js
// @homepageURL http://docbuilder.usersys.redhat.com
// ==/UserScript==

function logToConsole(message) {
    console.log(message);
}

function isDocbuilderWindow() {
    return window.location.host == "docbuilder.usersys.redhat.com" || window.location.host == "docbuilder.ecs.eng.bne.redhat.com";
};