|%
::
+$  comets  (list [comet sponsor=(unit comet)])
+$  comet
  $:  patp=@p
      nym=@t
  ==
::
+$  our-data  [who=comet custody=gw-custody-log]
::
+$  fief
  $%  [%turf p=(list turf) q=@udE]
      [%if p=@ifF q=@udE]
      [%is p=@isH q=@udE]
  ==
::
+$  gw-satpoint  [txid=@ux vout=@ud off=@ud]
::
+$  gw-manager  $%([%sont gw-satpoint] [%pass =pass])
::
+$  gw-network
  $:  rift=@ud
      life=@ud
      =pass
      sponsor=[has=? who=@p]
      escape=(unit @p)
      fief=(unit fief)
  ==
::
+$  gw-point
  $:  own=[sont=gw-satpoint mang=(unit gw-manager)]
      net=gw-network
      seen=(unit @ux)
  ==
::
+$  gw-custody-log  (list gw-custody-entry)
::
+$  gw-custody-entry  [txid=@ux height=@ud opening=(unit gw-opening)]
::
+$  gw-snapshot  [life=@ud rift=@ud key=@ sponsor=(unit @p) fief=(unit fief)]
::
+$  gw-opening
  $:  internal-key=@ux
      snapshot=gw-snapshot
      spawn-opening=(unit [spawn=gw-satpoint start-height=@ud])
  ==
::
--

