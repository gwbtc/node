|%
+$  hexb  [wid=@ud dat=@ux]
::
+$  block-height   @ud
+$  block-hash     @ux
+$  txid           @ux
+$  wtxid          @ux
+$  vout           @ud
+$  outpoint       [=txid =vout]
+$  script-sig     hexb
+$  script-pubkey  hexb
+$  script-hash    @ux
::
+$  transaction
  $:  version=@ux
      flag=@ud
      inputs=(list transaction-input)
      outputs=(list transaction-output)
      locktime=@ud
  ==
+$  transaction-input
  $:  =txid
      =vout
      =script-sig
      sequence=@ux
      witness=witness-stack
  ==
+$  transaction-output
  $:  value=@ud
      =script-pubkey
  ==
+$  witness-stack        (list hexb)
+$  transaction-witness  (list witness-stack)
::
+$  confirmations  (unit @ud)
::
+$  chainwork  @ux
::
+$  block-headers
  %+  map
      block-hash
  $:  =block-height
      =chainwork
      =block-header
  ==
+$  block-header
  $:  version=@ux
      previous-block-hash=@ux
      merkle-root=@ux
      time=@ud
      bits=@ux
      nonce=@ux
  ==
::
+$  block
  $:  block-header
      txs=(list transaction)
  ==
::
+$  merkle-block
  $:  block-header
      partial-merkle-tree
  ==
+$  partial-merkle-tree
  $:  total-txs=@ud
      hashes=(list @ux)
      flags=(list flag)
  ==
::
--

