function logToConsole(message) {
    console.log(message);
}

function isDocbuilderWindow() {
    return window.location.host == "docbuilder.usersys.redhat.com" || window.location.host == "docbuilder.ecs.eng.bne.redhat.com";
};