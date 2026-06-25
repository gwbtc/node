/-  *bitcoin-common,
    b-net=bitcoin-network
|%
::
++  update
  |%
  ::
  +$  is-synced  ?
  ::
  +$  best-block
    $%  [%new =block-height =block-hash]
        [%reorg-rollback =block-height =block-hash]
    ==
  ::
  +$  block-header
    $@  ~
    $:  confirmations=(unit @ud)
        =block-height
        =block-hash
        =block-header
    ==
  ::
  +$  block-filter
    $@  ~
    $:  confirmations=(unit @ud)
        =block-height
        =block-hash
        filter=hexb
    ==
  ::
  +$  block
    $@  ~
    $:  confirmations=(unit @ud)
        =block-height
        =block-hash
        =block
    ==
  ::
  +$  transaction
    $@  ~
    $:  confirmations=(unit @ud)
        index=@ud
        =block-height
        =block-hash
        =txid
        =wtxid
        =transaction
    ==
  ::
  --
::
--

