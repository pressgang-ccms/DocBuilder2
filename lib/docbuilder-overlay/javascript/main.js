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

"use strict";

requirejs.config({
    baseUrl: '/lib',
    paths: {
        'jquery': 'jquery/jquery-2.1.1.min',
        'URI': 'URI/URI',
        'IPv6': 'URI/IPv6',
        'punycode': 'URI/punycode',
        'SecondLevelDomains': 'URI/SecondLevelDomains',
        'moment': 'moment/moment-with-langs',
        'raphael': 'raphael/raphael-min',
        'raphael-pie': 'raphael/pie',
        'bootstrap' : 'bootstrap/js/bootstrap.min',
        'bootbox': 'bootbox/bootbox.min',
        'async': 'async/async',
        'typo' : 'typo/typo',
        'overlay' : 'docbuilder-overlay/javascript/overlay',
        'config': '/config'
    },
    shim: {
        'async' : {
            exports: 'async'
        },
        'bootstrap' : {
            deps: ['jquery']
        },
        'bootbox' : {
            deps: ['jquery', 'bootstrap'],
            exports: 'bootbox'
        },
        'raphael': {
            deps: ['jquery'],
            exports: 'Raphael'
        },
        'raphael-pie': {
            deps: ['raphael'],
            exports: "Raphael.fn.pieChart"
        },
        'typo': {
            exports: 'Typo'
        }
    }
});

requirejs(["jquery", "overlay"], function(jQuery, overlay) {
    /**
     * How long to wait for the window to load before starting the second pass
     * @type {number}
     */
    var SECOND_PASS_TIMEOUT = 30000;

    /*
     * When the page is loaded, start looking for the links that indicate the topics.
     */
    jQuery(document).ready(function() {
        overlay.findTopicsInHtml();
        overlay.addPermLinks();
        overlay.buildMenu();
    });

    /**
     * When all the assets have been loaded, the second pass can start
     */
    jQuery(window).load(function() {overlay.secondPass(false, true, false);});
    /**
     * If the page takes longer than 30 seconds to load, start the second pass anyway
     */
    window.setTimeout(function() {overlay.secondPass(false, false, true);}, SECOND_PASS_TIMEOUT);
});