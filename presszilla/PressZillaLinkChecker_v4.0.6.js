(function(){
    if (isDocbuilderWindow()) {
        /**
         * A list of links not to check for 404s
         * @type {Array}
         */
        var IGNORED_LINK_CHECK_NAMES  = ["javascript:void", "#", "Edit this topic", "permlink", "Report a bug"];

        var badLinkCount = 0;

        /**
         * GreaseMonkey and TamperMonkey work in subtly but significantly different ways. TamperMonkey
         * will call onload even if the GM_xmlhttpRequest load failed. GreaseMonkey won't. So we need
         * to keep a track of which links lead to which calls of checkDeadLinks().
         * @type {Array}
         */
        var processedLinks = [];

        function logURLNotLoading(link, href, links, index){
            console.log(href + " was not loaded successfully");

            ++badLinkCount;

            var button = jQuery('<button type="button" class="btn btn-default" style="width:230px; white-space: normal;")">' + href + '</button>');
            var buttonParent = jQuery('<div class="btn-group" style="margin-bottom: 8px;"></div>');

            buttonParent.append(button);
            jQuery('#badLinksItems').append(buttonParent);

            button.click(function(link) {
                return function() {
                    link.scrollIntoView();
                }
            }(link[0]));

            if (jQuery.inArray(index, processedLinks) == -1) {
                processedLinks.push(index);
                checkDeadLinks(links, ++index);
            }
        }

        function checkDeadLinks(links, index) {
            if (index < links.length) {

                jQuery('#badLinksBadge').remove();
                jQuery('#badLinks').append($('<span id="badLinksBadge" class="badge pull-right">' + badLinkCount + ' (' + (index / links.length * 100.0).toFixed(2) + '%)</span>'));

                var link = jQuery(links[index]);
                var href = link.attr("href");
                if (href != null &&
                    href != "" &&
                    href.substr(0, 1) != "#" &&
                    jQuery.inArray(link.text(), IGNORED_LINK_CHECK_NAMES) == -1 &&
                    unsafeWindow.URI(href).hostname() != "localhost" &&
                    unsafeWindow.URI(href).hostname() != "127.0.0.1" &&
                    (unsafeWindow.URI(href).protocol() == "http" || unsafeWindow.URI(href).protocol() == "https")) {

                    console.log("Checking " + href);

                    setTimeout(function() {
                        GM_xmlhttpRequest({
                            method: 'HEAD',
                            url: href,
                            timeout: 10000,
                            onabort: function(link, href) { return function() {logURLNotLoading(link, href, links, index); }}(link, href),
                            onerror: function(link, href) { return function() {logURLNotLoading(link, href, links, index);}}(link, href),
                            ontimeout: function(link, href) { return function() {logURLNotLoading(link, href, links, index);}}(link, href),
                            onload: function(response) {
                                if (jQuery.inArray(index, processedLinks) == -1) {
                                    processedLinks.push(index);
                                    checkDeadLinks(links, ++index);
                                }
                            }
                        });
                    }, 0);
                }  else {
                    console.log("Skipping " + href);

                    checkDeadLinks(links, ++index);
                }
            } else {
                jQuery('#badLinksBadge').remove();
                jQuery('#badLinks').append($('<span id="badLinksBadge" class="badge pull-right">' + badLinkCount + '</span>'));
            };
        }

        checkDeadLinks(jQuery('div[class=book] a'), 0);
    }
})();