function logToConsole(message) {
    console.log(message);
}

function isDocbuilderWindow() {
    return window.location.host == "docbuilder.usersys.redhat.com" || window.location.host == "docbuilder.ecs.eng.bne.redhat.com";
};

function isDocStageWindow() {
    return window.location.host == "documentation-devel.engineering.redhat.com";
}

function getRESTServerUrl() {
    return unsafeWindow.REST_SERVER ? unsafeWindow.REST_SERVER : "http://skynet.usersys.redhat.com/pressgang-ccms/rest/";
}