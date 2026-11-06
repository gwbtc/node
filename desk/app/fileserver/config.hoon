::  config: %utilities-fileserver configuration
::
::    serves files from /fil on this desk at /utilities/...
::    see the upstream example config in %suite (/app/fileserver/config)
::    for documentation of the optional arms (auth, index, fallback, etc).
::
|%
++  web-root   ^-  (list @t)  /utilities
++  file-root  ^-  path       /fil
--
