/-  *bitcoin-client,
    b-net=bitcoin-network
|_  act=bitcoin-client-action
::
++  grab
  |%
  ++  noun  bitcoin-client-action
  ++  json
    |=  jon=^json
    =,  dejs:format
    ^-  bitcoin-client-action
    |^  %.  jon
        %-  of
        :~  broadcast-transaction+broadcast-transaction
            connect-peer+earth-address
            disconnect-peer+earth-address
        ==
    ++  broadcast-transaction
      |=  val=^json
      (transaction-from-json val)
    ++  earth-address
      |=  val=^json
      =/  raw=[network-id=@t address=@t port=@ud]
        %.  val
        %-  ot
        :~  network-id+so
            address+so
            port+ni
        ==
      =/  nid=network-address-id:b-net
        ?+  network-id.raw  !!
            'ipv4'       %ipv4
            'ipv6'       %ipv6
            'torv2'      %torv2
            'torv3'      %torv3
            'i2p'        %i2p
            'cjdns'      %cjdns
            'yggdrasil'  %yggdrasil
        ==
      =/  add  (need (de:base16:mimes:html address.raw))
      ?>  =((network-address-width nid) p.add)
      [nid q.add port.raw]
    --
  --
++  grow
  |%
  ++  noun  act
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
::
++  json-field
  |=  [key=@t jon=^json]
  ^-  ^json
  ?>  ?=([%o *] jon)
  (need (~(get by p.jon) key))
::
++  json-decimal
  |=  jon=^json
  ^-  @ud
  =,  dejs:format
  (ni jon)
::
++  json-array
  |=  jon=^json
  ^-  (list ^json)
  ?>  ?=([%a *] jon)
  p.jon
::
++  json-hex
  |=  jon=^json
  ^-  hexb
  ?>  ?=([%s *] jon)
  (need (de:base16:mimes:html p.jon))
::
++  json-fixed-hex
  |=  [wid=@ud jon=^json]
  ^-  @ux
  =/  val  (json-hex jon)
  ?>  =(wid p.val)
  q.val
::
++  transaction-from-json
  |=  jon=^json
  ^-  transaction
  :*  (json-fixed-hex 4 (json-field 'version' jon))
      (json-decimal (json-field 'flag' jon))
      %+  turn
          (json-array (json-field 'inputs' jon))
          transaction-input-from-json
      %+  turn
          (json-array (json-field 'outputs' jon))
          transaction-output-from-json
      (json-decimal (json-field 'locktime' jon))
  ==
::
++  transaction-input-from-json
  |=  jon=^json
  ^-  transaction-input
  :*  (json-fixed-hex 32 (json-field 'txid' jon))
      (json-decimal (json-field 'vout' jon))
      (json-hex (json-field 'script-sig' jon))
      (json-fixed-hex 4 (json-field 'sequence' jon))
      %+  turn
          (json-array (json-field 'witness' jon))
          json-hex
  ==
::
++  transaction-output-from-json
  |=  jon=^json
  ^-  transaction-output
  :*  (json-decimal (json-field 'value' jon))
      (json-hex (json-field 'script-pubkey' jon))
  ==
--
