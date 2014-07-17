Scripts used on the DocBuilder Server

1. Install csprocessor
2. Run csprocessor setup
3. Install Publican
4. Copy scripts to /root
5. Install Node.js
5. Run node /root/app.js

The location of the script files can be changed if being run by another user.

The index.html and js files should not be cached. Setting this up in Apache and RHEL involves adding the following to /etc/httpd/conf/httpd.conf:

    <Directory /var/www/html>
      <FilesMatch "index\.html|\.js$">
      FileETag None
      <IfModule mod_headers.c>
      Header unset ETag
      Header set Cache-Control "max-age=0, no-cache, no-store, must-revalidate"
      Header set Pragma "no-cache"
      Header set Expires "Wed, 11 Jan 1984 05:00:00 GMT"
      </IfModule>
      </FilesMatch>
    </Directory>


See http://www.askapache.com/htaccess/using-http-headers-with-htaccess.html for more details

Previous versions of this application generated index.html files for all translated pages. Now there is one single
index.html file. For convenience the redirect.html file can be saved as the translated index.html 
(i.e. cp redirect.html ja/index.html) to provide an opportunity to update bookmarks for those that have bookmarked 
the old pages.