/-  *bitcoin-light-client
|_  dat=block-by-hash:update
::
++  grab
  |%
  ++  noun  block-by-hash:update
  --
++  grow
  |%
  ++  noun  dat
  ++  json
    ^-  ^json
    ?~  dat  ~
    %-  object
    :~  ['block-info' (block-info-json -.dat)]
        ['block' (block-json block.dat)]
    ==
  --
++  grad  %noun
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
++  object
  |=  fields=(list [@t ^json])
  ^-  ^json
  [%o (~(gas by *(map @t ^json)) fields)]
::
++  block-info-json
  |=  inf=block-info
  ^-  ^json
  %-  object
  :~  ['block-height' (decimal block-height.inf)]
      ['block-hash' (hex 32 block-hash.inf)]
      ['confirmations' ?~(confirmations.inf ~ (decimal u.confirmations.inf))]
      ['next-block-hash' ?~(next-block-hash.inf ~ (hex 32 u.next-block-hash.inf))]
      ['chainwork' (hex 32 chainwork.inf)]
  ==
::
++  block-json
  |=  bok=block
  ^-  ^json
  %-  object
  :~  ['block-header' (block-header-json -.bok)]
      ['txs' [%a (turn txs.bok transaction-json)]]
  ==
::
++  block-header-json
  |=  hed=block-header
  ^-  ^json
  %-  object
  :~  ['version' (hex 4 version.hed)]
      ['previous-block-hash' (hex 32 previous-block-hash.hed)]
      ['merkle-root' (hex 32 merkle-root.hed)]
      ['time' (decimal time.hed)]
      ['bits' (hex 4 bits.hed)]
      ['nonce' (hex 4 nonce.hed)]
  ==
::
++  transaction-json
  |=  txn=transaction
  ^-  ^json
  %-  object
  :~  ['version' (hex 4 version.txn)]
      ['flag' (decimal flag.txn)]
      ['inputs' [%a (turn inputs.txn transaction-input-json)]]
      ['outputs' [%a (turn outputs.txn transaction-output-json)]]
      ['locktime' (decimal locktime.txn)]
  ==
::
++  transaction-input-json
  |=  inp=transaction-input
  ^-  ^json
  %-  object
  :~  ['txid' (hex 32 txid.inp)]
      ['vout' (decimal vout.inp)]
      ['script-sig' (hex wid.script-sig.inp dat.script-sig.inp)]
      ['sequence' (hex 4 sequence.inp)]
      ['witness' [%a (turn witness.inp hexb-json)]]
  ==
::
++  transaction-output-json
  |=  out=transaction-output
  ^-  ^json
  %-  object
  :~  ['value' (decimal value.out)]
      ['script-pubkey' (hex wid.script-pubkey.out dat.script-pubkey.out)]
  ==
::
++  hexb-json
  |=  byt=hexb
  ^-  ^json
  (hex wid.byt dat.byt)
--
