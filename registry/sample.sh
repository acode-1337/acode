echo -n "SKULL" | xxd -ps
534b554c4c

885742cd7e0dad321622b5d3ad186797bd50c44cbde8b48be1583fbd534b554c4c

token-metadata-creator entry --init 885742cd7e0dad321622b5d3ad186797bd50c44cbde8b48be1583fbd534b554c4c

token-metadata-creator entry 885742cd7e0dad321622b5d3ad186797bd50c44cbde8b48be1583fbd534b554c4c \
--name "SKULL" \
--description "WGMI" \
--ticker "SKULL" \
--url "https://nemo.global" \
--logo "skull_f.png" \
--policy /home/hobo/Downloads/registry/token_skull222/policy.script

token-metadata-creator entry 885742cd7e0dad321622b5d3ad186797bd50c44cbde8b48be1583fbd534b554c4c -a /home/hobo/Downloads/registry/token_skull222/policy.skey

token-metadata-creator entry 885742cd7e0dad321622b5d3ad186797bd50c44cbde8b48be1583fbd534b554c4c --finalize
