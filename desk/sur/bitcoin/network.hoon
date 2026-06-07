/-  *bitcoin-common
|%
::
+$  network
  $?  %mainnet
      %testnet
      %testnet3
      %testnet4
      %signet
  ==
::
+$  message-type  _-:*message
::
+$  message
  $%  [%version version-payload]
      [%verack ~]
      [%wtxidrelay ~]
      [%sendaddrv2 ~]
      [%sendheaders ~]
      [%sendtxrcncl version=@ud remote-salt=@ux]
      [%sendcmpct receiver-is-high-bandwidth=? version=@ud]
      [%addr addresses=(list address-v1)]
      [%addrv2 addresses=(list address-v2)]
      [%ping nonce=@ux]
      [%pong nonce=@ux]
      [%inv =inventory]
      [%getdata =inventory]
      [%notfound =inventory]
      [%getblocks =block-locator hash-stop=(unit block-hash)]
      [%getheaders =block-locator hash-stop=(unit block-hash)]
      [%getblocktxn =block-hash differential-indexes=(list @ud)]
      [%getaddr ~]
      [%mempool ~]
      [%tx =transaction]
      [%block =block]
      [%headers headers=(list block-header)]
      [%merkleblock =merkle-block]

      :: TODO:
      :: [%filterload]
      :: [%filteradd]
      :: [%filterclear]
      :: [%feefilter]
      :: [%cmpctblock]
      :: [%blocktxn]
      :: [%getcfilters]
      :: [%cfilter]
      :: [%getcfheaders]
      :: [%cfheaders]
      :: [%getcfcheckpt]
      :: [%cfcheckpt]
  ==
::
+$  block-locator
  $:  protocol-version=@ud
      locator=(list block-hash)
  ==
::
+$  inventory
  %-  list
  $:  type=inventory-type
      hash=@ux
  ==
::
+$  inventory-type
  $?  %msg-tx
      %msg-block
      %msg-wtx
      :: only in getdata
      %msg-filtered-block
      %msg-cmpct-block
      %msg-witness-block
      %msg-witness-tx
      %undefined
  ==
::
+$  network-address-id
  $?  %ipv4
      %ipv6
      %torv2
      %torv3
      %i2p
      %cjdns
      %yggdrasil
  ==
::
+$  address-v1-partial
  $:  =services
      ip=@is
      port=@ud
  ==
::
+$  address-v1
  $:  time=@ud
      address-v1-partial
  ==
::
+$  address-v2
  $:  time=@ud
      =services
      id=network-address-id
      address=@ux
      port=@ud
  ==
::
+$  version-payload
  $:  version=@ud
      =services
      time=@ud
      receiver=address-v1-partial
      sender=address-v1-partial
      nonce=@ud
      user-agent=@t
      starting-height=@ud
      relay=?
  ==
::
+$  services
  $:  node-network=?
      node-bloom=?
      node-witness=?
      node-compact-filters=?
      node-network-limited=?
      node-p2p-v2=?
  ==
::
--

