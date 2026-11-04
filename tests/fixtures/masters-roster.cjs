// Synthetic roster for repeatable tests; the real checked list remains local.
exports.members = [
  ...Array.from({length:25}, (_, i) => ({name:`Membro fictício ${i+1}`})),
  {name:'Seabra'}, {name:'Aires'}, {name:'Pereira'}
];
