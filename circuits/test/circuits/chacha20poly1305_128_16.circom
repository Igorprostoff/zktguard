pragma circom 2.1.6;

include "../../account_age/templates/ChaCha20Poly1305.circom";

component main = ChaCha20Poly1305Decrypt(128, 16);
