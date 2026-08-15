/-  *bitcoin-light-client,
    b-net=bitcoin-network
|_  dat=blacklist:update
::
++  grab
  |%
  ++  noun  blacklist:update
  --
++  grow
  |%
  ++  noun  dat
  ++  json
    ^-  ^json
    ?-  -.dat
        %all
      %-  object
      :~  ['type' [%s 'all']]
          ['blacklist' [%a (turn ~(tap by blacklist.dat) blacklist-entry-json)]]
      ==
        %put
      %-  object
      :~  ['type' [%s 'put']]
          ['address' (earth-address-json address.dat)]
          ['info' (earth-blacklist-info-json info.dat)]
      ==
        %del
      %-  object
      :~  ['type' [%s 'del']]
          ['address' (earth-address-json address.dat)]
      ==
    ==
  --
++  grad  %noun
::
++  object
  |=  fields=(list [@t ^json])
  ^-  ^json
  [%o (~(gas by *(map @t ^json)) fields)]
::
++  decimal
  |=  num=@ud
  ^-  ^json
  [%n (crip ((d-co:co 1) num))]
::
++  hex
  |=  [wid=@ud dat=@ux]
  ^-  ^json
  [%s (en:base16:mimes:html wid dat)]
::
++  network-address-id-json
  |=  nid=network-address-id:b-net
  ^-  ^json
  ?-  nid
      %ipv4       [%s 'ipv4']
      %ipv6       [%s 'ipv6']
      %torv2      [%s 'torv2']
      %torv3      [%s 'torv3']
      %i2p        [%s 'i2p']
      %cjdns      [%s 'cjdns']
      %yggdrasil  [%s 'yggdrasil']
  ==
::
++  network-address-width
  |=  nid=network-address-id:b-net
  ^-  @ud
  ?-  nid
      %ipv4       4
      %ipv6       16
      %torv2      10
      %torv3      32
      %i2p        32
      %cjdns      16
      %yggdrasil  16
  ==
::
++  en-earth-time
  |=  tim=time
  %+  div
      (sub tim ~1970.1.1)
      ~s1
::
++  en-earth-duration-milliseconds
  |=  dur=@dr
  ^-  @ud
  (div dur (div ~s1 1.000))
::
++  earth-address-json
  |=  adr=earth-address
  ^-  ^json
  %-  object
  :~  ['network-id' (network-address-id-json net-id.adr)]
      ['address' (hex (network-address-width net-id.adr) address.adr)]
      ['port' (decimal port.adr)]
  ==
::
++  earth-blacklist-info-json
  |=  inf=earth-blacklist-info
  ^-  ^json
  =/  exp
    ?~  expiration.inf  ~
    (decimal (en-earth-duration-milliseconds u.expiration.inf))
  %-  object
  :~  ['when' (decimal (en-earth-time when.inf))]
      ['reason' [%s reason.inf]]
      ['expiration' exp]
  ==
::
++  blacklist-entry-json
  |=  [adr=earth-address inf=earth-blacklist-info]
  ^-  ^json
  %-  object
  :~  ['address' (earth-address-json adr)]
      ['info' (earth-blacklist-info-json inf)]
  ==
--
