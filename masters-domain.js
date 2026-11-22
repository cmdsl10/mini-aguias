/* Integer cents only. Shared by the browser and runnable domain checks. */
(function (root) {
  'use strict';
  const dates = (end = '2027-06-30') => {
    const result = [];
    for (const d = new Date('2026-10-21T12:00:00Z'); d.toISOString().slice(0, 10) <= end; d.setUTCDate(d.getUTCDate() + 7)) result.push(d.toISOString().slice(0, 10));
    return result;
  };
  function cell(player, training, attendance, allocations) {
    const status = attendance.find(a => a.player_id === player.id && a.training_id === training.id)?.status || 'pending';
    const due = player.attendance_eligible === true && training.status !== 'cancelled' && status === 'absent' ? 100 : 0;
    const paid = allocations.filter(a => a.player_id === player.id && a.training_id === training.id).reduce((n, a) => n + a.amount_cents, 0);
    return {status, due, paid, balance: due - paid};
  }
  function statistics(players, trainings, attendance, allocations) {
    return players.map(p => {
      // Attendance is recorded as soon as a mark is saved, even on open trainings.
      // Each recorded absence incurs a charge immediately, except cancelled trainings.
      const eligible = trainings.filter(t => p.attendance_eligible === true && t.status !== 'cancelled');
      const recorded = eligible.map(t => ({training:t, ...cell(p,t,attendance,allocations)}))
        .filter(c => c.status !== 'pending');
      const present = recorded.filter(c => c.status === 'present').length;
      const absent = recorded.filter(c => c.status === 'absent').length;
      const closedAbsences = recorded.filter(c => c.status === 'absent');
      const paidAbsences = closedAbsences.filter(c => c.due > 0 && c.paid >= c.due).length;
      const financial = recorded;
      return {...p, present, absent, paidAbsences, recorded:recorded.length,
        rate: recorded.length ? present / recorded.length : null,
        due: financial.reduce((n,c) => n+c.due,0),
        paid: financial.reduce((n,c) => n+c.paid,0),
        balance: financial.reduce((n,c) => n+c.balance,0)};
    }).sort((a,b) => (b.rate ?? -1) - (a.rate ?? -1) || a.display_name.localeCompare(b.display_name,'pt'));
  }
  function memberProfile(name) {
    const key = name.trim().normalize('NFC').toLocaleLowerCase('pt-PT');
    const sports_role = key === 'aires' ? 'coach' : key === 'pereira' ? 'president' : 'player';
    return {display_name:name.trim(), sports_role, playing_position:key === 'seabra' ? 'médio' : null, attendance_eligible:sports_role === 'player' ? true : null};
  }
  const api = {dates, cell, statistics, memberProfile};
  if (typeof module !== 'undefined') module.exports = api; else root.MastersDomain = api;
})(typeof window !== 'undefined' ? window : globalThis);
