/-  *bitcoin-light-client
|_  bes=best-block:update
::
++  grab
  |%
  ++  noun  best-block:update
  --
++  grow
  |%
  ++  noun  bes
  ++  json
    ^-  ^json
    ?-  -.bes
    ::
        %new
      (block-height-hash-json block-height.bes block-hash.bes)
    ::
        %reorg-rollback
      %-  object
      :~  ['last-common' (block-height-hash-json -.last-common.bes +.last-common.bes)]
          ['stale-branch' [%a (turn stale-branch.bes block-height-hash-json)]]
      ==
    ::
    ==
  --
++  grad  %noun
::
++  object
  |=  fields=(list [@t ^json])
  ^-  ^json
  [%o (~(gas by *(map @t ^json)) fields)]
::
++  block-height-hash-json
  |=  [height=@ud hash=@ux]
  ^-  ^json
  %-  object
  :~  ['block-height' [%n (crip ((d-co:co 1) height))]]
      ['block-hash' [%s (en:base16:mimes:html 32 hash)]]
  ==
--
