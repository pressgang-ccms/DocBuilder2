Scripts used on the DocBuilder Server

1. Install csprocessor
2. Run csprocessor setup
3. Install Publican
4. Copy scripts to /root
5. Install Node.js
5. Run node /root/app.js

The location of the script files can be changed if being run by another user.

The index.html and js files should not be cached. Setting this up in Apache and RHEL involves:

1. Setting "AllowOverride ALL" in /etc/httpd/conf/httpd.conf
2. Creating a .htaccess file with the contents
   <FilesMatch "index\.html|\.js$">
   FileETag None
   <ifModule mod_headers.c>
   Header unset ETag
   Header set Cache-Control "max-age=0, no-cache, no-store, must-revalidate"
   Header set Pragma "no-cache"
   Header set Expires "Wed, 11 Jan 1984 05:00:00 GMT"
   </ifModule>
   </FilesMatch>


