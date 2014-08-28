#!/usr/bin/python

import zipfile as zf
import sys
import os
import glob
import re

version = "1.9"
default_host = "http://docbuilder.example.com/"
default_secure_host = "https://docbuilder.example.com/"
default_rest_host = "http://localhost:8080/"
default_ui_host = "http://localhost:8080/"
html_dir = "/var/www/html/"
app_dir = "/home/pressgang/DocBuilder2/"


def get_script_path():
    return os.path.dirname(os.path.realpath(sys.argv[0]))


def write_to_zip(z, filename, dest_dir):
    source = os.path.join(get_script_path(), filename)
    dest = os.path.join(dest_dir, filename)
    z.write(source, dest)


def write_dir_to_zip(z, directory, dest_dir, root_dir="", skip_files=[]):
    base_dir = os.path.join(root_dir, directory)
    abs_dir = os.path.join(get_script_path(), base_dir)
    for f in glob.glob(abs_dir + "/*"):
        filename = os.path.basename(f)
        if filename in skip_files:
            continue
        elif os.path.isfile(f):
            write_to_zip(z, os.path.join(base_dir, filename), dest_dir)
        elif os.path.isdir(f):
            write_dir_to_zip(z, filename, dest_dir, base_dir, skip_files)


def build_html_dir(z):
    print "Zipping the HTML directory content"
    write_dir_to_zip(z, "lib", html_dir)
    write_dir_to_zip(z, "fonts", html_dir)
    write_dir_to_zip(z, "presszilla", html_dir)
    write_to_zip(z, "index.html", html_dir)


def build_app_dir(z):
    print "Zipping the app directory content"
    write_dir_to_zip(z, "node_modules/collections", app_dir)
    write_dir_to_zip(z, "node_modules/express", app_dir)
    write_dir_to_zip(z, "node_modules/jade", app_dir)
    write_dir_to_zip(z, "node_modules/jquery", app_dir)
    write_dir_to_zip(z, "node_modules/moment", app_dir)
    write_dir_to_zip(z, "src", app_dir, skip_files=["config.js"])
    write_to_zip(z, "app.js", app_dir)
    write_to_zip(z, "app-translation.js", app_dir)
    write_to_zip(z, "build_books.sh", app_dir)
    write_to_zip(z, "build_original_books.sh", app_dir)
    write_to_zip(z, "build_original_books_with_js.sh", app_dir)


def add_copyright_files(z):
    write_to_zip(z, "COPYING", app_dir)
    write_to_zip(z, "COPYING.LESSER", app_dir)


def fix_hostname(hostname):
    fixed_hostname = hostname
    if not hostname.endswith("/"):
        fixed_hostname += "/"

    if (not hostname.startswith("http://")) and (not hostname.startswith("https://")):
        fixed_hostname = "http://" + fixed_hostname

    return fixed_hostname


def fix_presszilla_user_js(z, hostname):
    filename = os.path.join(get_script_path(), "PressZilla.user.js")

    # Read the file contents
    f = open(filename, "rb")
    contents = f.read()
    f.close()

    # Replace any urls to the url
    contents = contents.replace(default_host, fix_hostname(hostname))
    contents = contents.replace(default_secure_host, fix_hostname(hostname.replace("http://", "https://")))

    # Write the content to the zip
    dest = os.path.join(html_dir[1:], "PressZilla.user.js")
    z.writestr(dest, contents)


def fix_config(z, hostname, rest_hostname=None, ui_hostname=None):
    filename = os.path.join(get_script_path(), "src/config.js")

    # Read the file contents
    f = open(filename, "rb")
    contents = f.read()
    f.close()

    # Replace any urls to the url
    contents = re.sub(r"(OPEN(_LOCALE)?_LINK:\s*\")" + default_host, r"\1" + fix_hostname(hostname), contents)
    if rest_hostname is not None:
        contents = re.sub(r"(REST_SERVER:\s*\")" + default_rest_host, r"\1" + fix_hostname(rest_hostname), contents)
    if ui_hostname is not None:
        contents = re.sub(r"(UI_URL:\s*\")" + default_ui_host, r"\1" + fix_hostname(ui_hostname), contents)
        contents = re.sub(r"(EDIT_LINK:\s*\")" + default_ui_host, r"\1" + fix_hostname(ui_hostname), contents)

    # Write the content to the zip
    dest = os.path.join(app_dir[1:], "src/config.js")
    z.writestr(dest, contents)


def main():
    args = sys.argv[1:]

    # Create a zip file
    z = zf.ZipFile("docbuilder-" + version + ".zip", "w")

    # Add the content
    build_html_dir(z)
    build_app_dir(z)
    add_copyright_files(z)

    # Fix the urls if needed
    if len(args) > 0:
        fix_presszilla_user_js(z, args[0])

        rest_hostname = None if len(args) < 2 else args[1]
        ui_hostname = rest_hostname if len(args) < 3 else args[2]
        fix_config(z, args[0], rest_hostname, ui_hostname)
    else:
        write_to_zip(z, "PressZilla.user.js", html_dir)
        write_to_zip(z, "src/config.js", app_dir)

    z.close()


if __name__ == '__main__':
    main()