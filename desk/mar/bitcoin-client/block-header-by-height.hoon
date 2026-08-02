/-  *bitcoin-light-client
|_  dat=block-header-by-height:update
::
++  grab
  |%
  ++  noun  block-header-by-height:update
  --
++  grow
  |%
  ++  noun  dat
  ++  json
    ^-  ^json
    %-  object
    :~  ['block-info' (block-info-json -.dat)]
        ['block-header' (block-header-json block-header.dat)]
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
--
