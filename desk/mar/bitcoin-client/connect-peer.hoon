/-  *bitcoin-light-client,
    b-net=bitcoin-network
|_  adr=earth-address
::
++  grab
  |%
  ++  noun  earth-address
  ++  json
    |=  jon=^json
    ^-  earth-address
    =/  raw=[network-id=@t address=@t port=@ud]
      %.  jon
      =,  dejs:format
      %-  ot
      :~  network-id+so
          address+so
          port+ni
      ==
    =/  nid=network-address-id:b-net
      ?+  network-id.raw  !!
          %'ipv4'       %ipv4
          %'ipv6'       %ipv6
          %'torv2'      %torv2
          %'torv3'      %torv3
          %'i2p'        %i2p
          %'cjdns'      %cjdns
          %'yggdrasil'  %yggdrasil
      ==
    =/  add  (need (de:base16:mimes:html address.raw))
    ?>  =((network-address-width nid) p.add)
    [nid q.add port.raw]
  --
++  grow
  |%
  ++  noun  adr
  --
++  grad  %noun
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
--
