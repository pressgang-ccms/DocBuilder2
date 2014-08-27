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

module.exports = function(grunt) {

    grunt.loadNpmTasks('grunt-contrib-jshint');
    grunt.loadNpmTasks('grunt-contrib-copy');
    grunt.loadNpmTasks('grunt-bower-install-simple');

    /***************************************************************************
     * Configuration
     */
    grunt.initConfig({
        pkg: grunt.file.readJSON('package.json'),
        jshint: {
            options: {
                jshintrc: true,
                ignores: [
                    'node_modules/**/*.js',
                    'bower-libs/**/*.js'
                ]
            },
            client: [
                'lib/docbuilder*/*.js',
                'app.js',
                'app-translation.js'
            ]
        },
        'bower-install-simple': {
            options: {
                color: true,
                directory: "bower-lib"
            },
            "prod": {
                options: {
                    production: true
                }
            },
            "dev": {
                options: {
                    production: false
                }
            }
        },
        copy: {
            resources: {
                files: [
                    // async
                    {
                        expand: true,
                        cwd: 'bower-lib/async/lib',
                        src: ['*.js'],
                        dest: 'lib/async'
                    },
                    // bootbox
                    {
                        expand: true,
                        cwd: 'bower-lib/bootbox',
                        src: ['*.js'],
                        dest: 'lib/bootbox'
                    },
                    // bootstrap
                    {
                        expand: true,
                        cwd: 'bower-lib/patternfly/components/bootstrap/dist',
                        src: ['**'],
                        dest: 'lib/bootstrap'
                    },
                    // bootstrap-select
                    {
                        expand: true,
                        cwd: 'bower-lib/patternfly/components/bootstrap-select',
                        src: ['*.js', ".css"],
                        dest: 'lib/bootstrap-select'
                    },
                    // g.raphael
                    {
                        expand: true,
                        cwd: 'bower-lib/g.raphael',
                        src: ['g.pie*.js'],
                        dest: 'lib/raphael'
                    },
                    // jquery
                    {
                        expand: true,
                        cwd: 'bower-lib/patternfly/components/jquery',
                        src: ['*.js', '*.map'],
                        dest: 'lib/jquery'
                    },
                    // moment
                    {
                        expand: true,
                        flatten: true,
                        cwd: 'bower-lib/moment',
                        src: ['*.js', 'min/*.js'],
                        dest: 'lib/moment'
                    },
                    // patternfly
                    {
                        expand: true,
                        cwd: 'bower-lib/patternfly/dist',
                        src: ['*.js'],
                        dest: 'lib/patternfly'
                    },
                    // patternfly-components
                    {
                        expand: true,
                        cwd: 'bower-lib/patternfly/components/',
                        src: ['font-awesome/**'],
                        dest: 'lib/components'
                    },
                    // raphael
                    {
                        expand: true,
                        cwd: 'bower-lib/raphael',
                        src: ['*.js'],
                        dest: 'lib/raphael'
                    },
                    // typo.js
                    {
                        expand: true,
                        cwd: 'bower-lib/Typo.js/typo',
                        src: ['*.js'],
                        dest: 'lib/typo'
                    },
                    // underscore
                    {
                        expand: true,
                        cwd: 'bower-lib/underscore',
                        src: ['*.js', '*.map'],
                        dest: 'lib/underscore'
                    },
                    // uri.js
                    {
                        expand: true,
                        cwd: 'bower-lib/uri.js/src',
                        src: ['*.js'],
                        dest: 'lib/URI'
                    }
                ]
            }
        }
    });

    /***************************************************************************
     * Clean
     */
    grunt.registerTask('clean-bower', function() {

        // Remove public/res-min folder
        grunt.file['delete']('bower-lib');

    });

    /***************************************************************************
     * Build JavaScript
     */
    grunt.registerTask('build-js', function() {

        // JSHint validation
        grunt.task.run('jshint');
    });

    /***************************************************************************
     * Resources
     */
    grunt.registerTask('build-res', function() {
        // Install the resources
        grunt.task.run('bower-install-simple');

        // Copy the resources
        grunt.task.run('copy:resources');
    });

    /***************************************************************************
     * Default task
     */
    grunt.registerTask('default', function() {
        grunt.task.run('build-js');
        grunt.task.run('build-res');
    });

};
