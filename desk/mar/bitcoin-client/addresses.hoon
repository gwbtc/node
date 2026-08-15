/-  *bitcoin-light-client,
    b-net=bitcoin-network
|_  dat=addresses:update
::
++  grab
  |%
  ++  noun  addresses:update
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
          ['addresses' [%a (turn ~(tap by addresses.dat) address-json)]]
      ==
        %put
      %-  object
      :~  ['type' [%s 'put']]
          ['address' (earth-address-json address.dat)]
          ['info' (earth-address-info-json info.dat)]
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
++  address-rank-json
  |=  rak=address-rank
  ^-  ^json
  ?-  rak
      %priority  [%s 'priority']
      %known     [%s 'known']
      %unknown   [%s 'unknown']
  ==
::
++  address-provenance-json
  |=  pro=address-provenance
  ^-  ^json
  ?-  -.pro
      %userspace
    %-  object
    :~  ['type' [%s 'userspace']]
    ==
      %network
    %-  object
    :~  ['type' [%s 'network']]
        ['who' (earth-address-json who.pro)]
    ==
  ==
::
++  earth-address-info-json
  |=  inf=earth-address-info
  ^-  ^json
  =/  lat
    ?~  last-heard.inf  ~
    (decimal (en-earth-time u.last-heard.inf))
  %-  object
  :~  ['address-provenance' (address-provenance-json address-provenance.inf)]
      ['address-rank' (address-rank-json address-rank.inf)]
      ['last-heard' lat]
      ['services' (services-json services.inf)]
  ==
::
++  address-json
  |=  [adr=earth-address inf=earth-address-info]
  ^-  ^json
  %-  object
  :~  ['address' (earth-address-json adr)]
      ['info' (earth-address-info-json inf)]
  ==
--
