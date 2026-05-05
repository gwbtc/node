|%
::  little endian hex bytes
+$  hexb  [wid=@ud dat=@ux]
::
+$  block-height   @ud
+$  block-hash     @ux
+$  txid           @ux
+$  vout           @ud
+$  outpoint       [=txid =vout]
+$  script-sig     hexb
+$  script-pubkey  hexb
+$  script-hash    @ux
::
+$  transaction
  $:  version=@ux
      locktime=@ud
      inputs=(list transaction-input)
      outputs=(list transaction-output)
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
+$  block-headers  ((mop block-height block-header) lth)
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
  $:  =block-header
      hashes=(list @ux)
      flags=(list flag)
  ==
::
--

