/-  *bitcoin-light-client,
    b-net=bitcoin-network
|_  dat=peers:update
::
++  grab
  |%
  ++  noun  peers:update
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
          ['peers' [%a (turn ~(tap by peers.dat) peer-json)]]
      ==
        %put
      %-  object
      :~  ['type' [%s 'put']]
          ['address' (earth-address-json address.dat)]
          ['info' (earth-peer-info-json info.dat)]
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
++  earth-address-json
  |=  adr=earth-address
  ^-  ^json
  %-  object
  :~  ['network-id' (network-address-id-json net-id.adr)]
      ['address' (hex (network-address-width net-id.adr) address.adr)]
      ['port' (decimal port.adr)]
  ==
::
++  services-json
  |=  ser=services:b-net
  ^-  ^json
  %-  object
  :~  ['node-network' [%b node-network.ser]]
      ['node-bloom' [%b node-bloom.ser]]
      ['node-witness' [%b node-witness.ser]]
      ['node-compact-filters' [%b node-compact-filters.ser]]
      ['node-network-limited' [%b node-network-limited.ser]]
      ['node-p2p-v2' [%b node-p2p-v2.ser]]
  ==
::
++  earth-peer-info-json
  |=  inf=earth-peer-info
  ^-  ^json
  =/  lat
    ?~  last-heard.inf  ~
    [%n (crip ((d-co:co 1) (en-earth-time u.last-heard.inf)))]
  %-  object
  :~  ['handshake-done' [%b handshake-done.inf]]
      ['wtxidrelay' [%b wtxidrelay.inf]]
      ['services' (services-json services.inf)]
      ['last-heard' lat]
  ==
::
++  peer-json
  |=  [adr=earth-address inf=earth-peer-info]
  ^-  ^json
  %-  object
  :~  ['address' (earth-address-json adr)]
      ['info' (earth-peer-info-json inf)]
  ==
--
