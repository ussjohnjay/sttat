/*
    Star Trek Timelines Assimilate This (STTAT)
    Copyright (c) 2021 USS John Jay

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see <http://www.gnu.org/licenses/>.
*/

/*jshint esversion: 6 */

// Voyage calculation inspired by TemporalAgent7 and IAmPicard before that
//  https://github.com/stt-datacore/website
//  https://github.com/iamtosk/StarTrekTimelinesSpreadsheet

class Voyagers {
	constructor(rosters, config) {
		this.crew = rosters.crew;	// Required: {id, name, skills, traits} Optional: {frozen, immortal, max_rarity}
		this.ships = rosters.ships;	// Required: {id, name, antimatter}
		this.config = config;
	}

	sendProgress(message) {
		if (this.config.debugCallback)
			this.config.debugCallback(message);
		if (this.config.progressCallback)
			this.config.progressCallback(message);
	}

	// idenfity best ship by ship_trait
	// prime roster by primary_ and secondary_scores
	// do 10 attempts:
	//	get scores of primed roster, adjusted by boosts
	//	do 12 slots:
	//		assign crew with best score to lineup
	//	adjust boosts to balance lineup
	// return best lineup after 10 attempts
	assemble(voyage, boosts, options, optimize) {
		let self = this;

		let debug = this.config.debugCallback;

		this.sendProgress("Studying ships...");
		let bestShip = this.getBestShip(voyage.ship_trait);
		if (debug) debug("Best ship: "+bestShip.name+" ("+bestShip.antimatter+" AM)");
		this.sendProgress("Studying crew...");
		let primedRoster = this.getPrimedRoster(voyage, options);
		if (debug) debug("Considering "+primedRoster.length+" crew for this voyage");

		let attempts = [];
		let iAttempts = 0, iBestTime = 0, iBestAttempt = -1;
		let iAttemptsAllowed = optimize ? optimize.maxAttempts : 1;

		return new Promise(function(resolve, reject) {
			let sequence = Promise.resolve();
			for (let i = 0; i < iAttemptsAllowed; i++) {
				sequence = sequence.then(() => {
					let sTestMessage = iAttemptsAllowed > 1 ? " ("+(i+1)+"/"+iAttemptsAllowed+")" : "";
					self.sendProgress("Testing lineups"+sTestMessage+". Please wait...");
					return new Promise(function(resolve, reject) {
						setTimeout(function() {
							let lineup = self.getBoostedLineup(primedRoster, boosts);
							if (lineup)
								resolve(lineup);
							else
								reject("You don't have enough crew for this voyage!");
						}, 0);
					});
				})
				.then((lineup) => {
					let manifest = {
						'voyage': voyage,
						'ship': bestShip,
						'lineup': lineup
					};
					let estimates = optimize ? new VoyagersEstimates(manifest, optimize.calculator) : false;

					if (debug) {
						if (estimates) debug((iAttempts+1)+") Estimate: "+estimates.print()+" (99%: "+estimates.printResult('saferResult')+")");
						let sLineup = "";
						for (let i = 0; i < lineup.crew.length; i++) {
							if (sLineup != "") sLineup += ", ";
							sLineup += lineup.crew[i].name + " (" + lineup.crew[i].score.toFixed(1) + ")";
						}
						debug("Lineup: "+sLineup);
						debug("Boosts: "+boosts.primary.toFixed(2)+"+"+boosts.secondary.toFixed(2)+"+"+boosts.other.toFixed(2));
						debug("Scores: "+lineup.skills.command_skill+", "+lineup.skills.diplomacy_skill+", "
								+lineup.skills.security_skill+", "+lineup.skills.engineering_skill+", "
								+lineup.skills.science_skill+", "+lineup.skills.medicine_skill);
					}

					attempts.push({'manifest': manifest, 'estimates': estimates});

					if (estimates && estimates.time > iBestTime) {
						iBestTime = estimates.time;
						iBestAttempt = iAttempts;
					}

					if (iAttempts+1 < iAttemptsAllowed) {
						let primaryScore = lineup.skills[voyage.skills.primary_skill];
						let secondaryScore = lineup.skills[voyage.skills.secondary_skill];
						let finetuneRatio = 1/(iAttempts+1); // Finetune by smaller increments as attempts increase
						boosts = self.adjustBoosts(boosts, lineup.score, primaryScore, secondaryScore, finetuneRatio);
					}

					iAttempts++;

					// We're done, send the best lineup back as [manifest, estimates]
					if (!boosts || iAttempts == iAttemptsAllowed) {
						let attempt = attempts[iBestAttempt];
						self.sendProgress("Voyage lineup assembled!");
						if (debug) {
							if (attempt.estimates) debug("Best run: " + (iBestAttempt+1) + " (" + attempt.estimates.print() + ")");
							//if (iAttempts+1 == 1) debug(assemblyLog);
						}
						resolve([attempt.manifest, attempt.estimates]);
					}
				});
			}
			sequence.catch((error) => {
				reject(error);
			});
		});
	}

	getBestShip(shiptrait) {
		let consideredShips = [];
		for (let i = 0; i < this.ships.length; i++) {
			let ship = {
				'id': this.ships[i].id,
				'name': this.ships[i].name,
				'antimatter': this.ships[i].antimatter,
				'isIdeal': false
			};
			let traits = this.ships[i].traits;
			if (traits.find(trait => trait == shiptrait)) {
				ship.antimatter += 150;
				ship.isIdeal = true;
			}
			consideredShips.push(ship);
		}
		consideredShips.sort((a, b) => b.antimatter - a.antimatter);
		return consideredShips[0];
	}

	getPrimedRoster(voyage, options) {
		const SKILL_IDS = ['command_skill', 'diplomacy_skill', 'security_skill',
							'engineering_skill', 'science_skill', 'medicine_skill'];

		let skills = voyage.skills;
		let traits = [];
		for (let i = 0; i < voyage.crew_slots.length; i++) {
			traits.push(voyage.crew_slots[i].trait);
		}

		let primedRoster = [];
		for (let i = 0; i < this.crew.length; i++) {
			// Don't consider crew that match any exclude options
			let bExclude = false;
			if (options) {
				if (options.excludes && options.excludes.indexOf(this.crew[i].id) >= 0)
					bExclude = true;
				if (!options.considerFrozen && this.crew[i].frozen)
					bExclude = true;
				if (options.excludeImmortals && this.crew[i].immortal)
					bExclude = true;
				if (options.max_rarity && this.crew[i].max_rarity > options.max_rarity)
					bExclude = true;
			}
			if (bExclude) continue;

			let iPrimaryScore = 0, iSecondaryScore = 0, iOtherScore = 0;
			let rViableSkills = [0, 0, 0, 0, 0, 0];
			let rViableSlots = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
			let rTraitSlots = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

			let bGeneralist = true;
			for (let iSkill = 0; iSkill < SKILL_IDS.length; iSkill++) {
				let skillId = SKILL_IDS[iSkill];
				if (!this.crew[i].skills[skillId]) continue;
				rViableSkills[iSkill] = 1;
				rViableSlots[iSkill*2] = 1;
				rViableSlots[(iSkill*2)+1] = 1;
				let iSkillScore = this.crew[i].skills[skillId].core
									+ this.crew[i].skills[skillId].range_min
									+ (this.crew[i].skills[skillId].range_max-this.crew[i].skills[skillId].range_min)/2;
				if (skillId == skills.primary_skill)
					iPrimaryScore = iSkillScore;
				else if (skillId == skills.secondary_skill)
					iSecondaryScore = iSkillScore;
				else
					iOtherScore += iSkillScore;
				if (this.crew[i].traits.indexOf(traits[iSkill*2]) >= 0)
					rTraitSlots[iSkill*2] = 1;
				if (this.crew[i].traits.indexOf(traits[(iSkill*2)+1]) >= 0)
					rTraitSlots[(iSkill*2)+1] = 1;
				if (skillId == "engineering_skill" || skillId == "science_skill" || skillId == "medicine_skill")
					bGeneralist = false;
			}
			if (options.favorSpecialists && bGeneralist)
				iOtherScore -= iOtherScore/10;

			let crewman = {
				'id': this.crew[i].id,
				'name': this.crew[i].name,
				'skills': this.crew[i].skills,
				'primary_score': iPrimaryScore,
				'secondary_score': iSecondaryScore,
				'other_score': iOtherScore,
				'viable_slots': rViableSlots,
				'trait_slots': rTraitSlots
			};
			primedRoster.push(crewman);
		}
		return primedRoster;
	}

	// 1 all: open ideal slot
	// 2A ideal:
	//	2A1 canNotDisplace: can current assignee move without displacing an ideal?
	//	2A2 canDisplace: can current assignee move displacing exactly 1 ideal?
	// 2B non-ideal:
	// 	2B1 any open viable slot
	// 	2B2 canNotDisplace: can current assignee move without displacing an ideal?
	// 3 all: skip volunteer
	getBoostedLineup(primedRoster, boosts) {
		function tryToAssign(assignments, seeker, bIdealOnly, bCanDisplace, tested = []) {
			let sDebugPrefix = "";
			for (let i = 0; i < tested.length; i++) {
				sDebugPrefix += "-";
			}
			sDebugPrefix += " ";

			// Identify state of all viable slots
			let open_ideal = [], open_viable = [], occupied_ideal = [], occupied_viable = [];
			for (let i = 0; i < 12; i++) {
				if (!seeker.viable_slots[i]) continue;
				if (assignments[i].id >= 0) {
					occupied_viable.push(i);
					if (seeker.trait_slots[i]) occupied_ideal.push(i);
				}
				else {
					open_viable.push(i);
					if (seeker.trait_slots[i]) open_ideal.push(i);
				}
			}

			// 1) Seat in ideal open slot
			if (open_ideal.length > 0) {
				doAssign(assignments, seeker, open_ideal[0], sDebugPrefix);
				return true;
			}

			// 2A)
			if (bIdealOnly) {
				// 2A1) Seat in occupied slot only if everyone moves around willingly
				let idealsTested = JSON.parse(JSON.stringify(tested));
				for (let i = 0; i < occupied_ideal.length; i++) {
					let slot = occupied_ideal[i];
					// Ignore slots we've already inquired about by this seeker and descendant seekers
					if (idealsTested.indexOf(slot) >= 0) continue;
					idealsTested.push(slot);
					let assignee = assignments[slot];
					assemblyLog += "\n" + sDebugPrefix + seeker.name + " (" + seeker.score + ") would be ideal in slot " + slot  + ". Is " + assignee.name + " (" + assignee.score + ") willing and able to move?";
					if (tryToAssign(assignments, assignee, true, false, idealsTested)) {
						doAssign(assignments, seeker, slot, sDebugPrefix);
						return true;
					}
				}
				// 2A2) Seat in occupied slot only if exactly 1 other is able to move from ideal slot
				idealsTested = JSON.parse(JSON.stringify(tested));
				for (let i = 0; i < occupied_ideal.length; i++) {
					let slot = occupied_ideal[i];
					// Ignore slots we've already inquired about by this seeker and descendant seekers
					if (idealsTested.indexOf(slot) >= 0) continue;
					idealsTested.push(slot);
					let assignee = assignments[slot];
					assemblyLog += "\n" + sDebugPrefix + seeker.name + " (" + seeker.score + ") insists on being in slot " + slot  + ". Is " + assignee.name + " (" + assignee.score + ") able to move?";
					if (tryToAssign(assignments, assignee, false, true, idealsTested)) {
						doAssign(assignments, seeker, slot, sDebugPrefix);
						return true;
					}
				}
			}

			// 2B)
			if (!bIdealOnly) {
				// 2B1) Seat in open slot
				if (open_viable.length > 0) {
					doAssign(assignments, seeker, open_viable[0], sDebugPrefix);
					return true;
				}

				// 2B2) Seat in occupied slot only if everyone moves around willingly
				let viablesTested = JSON.parse(JSON.stringify(tested));
				for (let i = 0; i < occupied_viable.length; i++) {
					let slot = occupied_viable[i];
					// Ignore slots we've already inquired about by this seeker and descendant seekers
					if (viablesTested.indexOf(slot) >= 0) continue;
					viablesTested.push(slot);
					let assignee = assignments[slot];
					if (!seeker.trait_slots[slot] && assignee.trait_slots[slot] && !bCanDisplace)
						continue;
					assemblyLog += "\n" + sDebugPrefix + seeker.name + " (" + seeker.score + ") is inquiring about slot " + slot  + ". Is " + assignee.name + " (" + assignee.score + ") willing and able to move?";
					if (tryToAssign(assignments, assignee, false, false, viablesTested)) {
						doAssign(assignments, seeker, slot, sDebugPrefix);
						return true;
					}
				}
			}

			// 3) Can't seat
			assemblyLog += "\n" + sDebugPrefix + seeker.name + " (" + seeker.score + ") will not take a new assignment";
			return false;
		}

		function doAssign(assignments, seeker, iAssignment, sPrefix = "") {
			let sIdeal = seeker.trait_slots[iAssignment] ? "ideal " : "";
			let sOpen = assignments[iAssignment].id == -1 ? "open ": "";
			assemblyLog += "\n" + sPrefix + seeker.name + " (" + seeker.score + ") accepts " + sIdeal + "assignment in " + sOpen + "slot " + iAssignment;
			assignments[iAssignment] = seeker;
			assignments[iAssignment].assignment = iAssignment;
			assignments[iAssignment].denied_slots = [];
			assignments[iAssignment].isIdeal = seeker.trait_slots[iAssignment];
		}

		let assemblyLog = "";

		const trait_boost = 200;

		let boostedScores = [];
		for (let i = 0; i < primedRoster.length; i++) {
			let baseScore = primedRoster[i].primary_score * boosts.primary
							+ primedRoster[i].secondary_score * boosts.secondary
							+ primedRoster[i].other_score * boosts.other;
			let bestScore = baseScore + trait_boost;
			let baseSlots = [], bestSlots = [];
			for (let j = 0; j < 12; j++) {
				if (!primedRoster[i].viable_slots[j]) continue;
				baseSlots.push(j);
				if (primedRoster[i].trait_slots[j]) bestSlots.push(j);
			}
			if (bestSlots.length > 0)
				boostedScores.push({ score: bestScore, id: primedRoster[i].id, isIdeal: true });
			if (baseSlots.length > bestSlots.length)
				boostedScores.push({ score: baseScore, id: primedRoster[i].id, isIdeal: false });
		}
		boostedScores.sort((a, b) => b.score - a.score);

		let assignments = Array.from({length:12},()=> ({'id': -1}));
		let iAssigned = 0;

		let skipped = [];

		while (boostedScores.length > 0 && iAssigned < 12) {
			let testScore = boostedScores.shift();

			// Volunteer is already assignments, list other matching slots as alts
			let repeat = assignments.find(assignee => assignee.id == testScore.id);
			if (repeat) {
				assemblyLog += "\n~ " + repeat.name + " (" + testScore.score + ") is already assignments to slot " + repeat.assignment + " (" + repeat.score + ") ~";
				continue;
			}

			let volunteer = primedRoster.find(primed => primed.id == testScore.id);
			volunteer.score = testScore.score;
			volunteer.denied_slots = [];

			if (tryToAssign(assignments, volunteer, testScore.isIdeal, testScore.isIdeal)) {
				iAssigned++;
			}
			else {
				let bRepeatSkip = skipped.indexOf(volunteer.id) >= 0;
				skipped.push(volunteer.id);
				if (bRepeatSkip || !testScore.isIdeal)
					assemblyLog += "\n!! Skipping " + volunteer.name + " (" + volunteer.score + ") forever !!";
				else
					assemblyLog += "\n! Skipping " + volunteer.name + " (" + volunteer.score + ") for now !";
			}
		}

		if (iAssigned == 12)
			return new VoyagersLineup(assignments);
		
		return false;
	}

	// Reweight boosts to balance skill scores
	// Chances of hazards by skill are 35%, 25%, 10%, 10%, 10%, 10%
	//  We'll adjust prime targets based on total strength of roster and initial boosts,
	//	 and then adjust boosts based on how close to targets a lineup scores
	adjustBoosts(boosts, totalScore, primaryScore, secondaryScore, finetuneRatio) {
		let newBoosts = {
			'primary': boosts.primary,
			'secondary': boosts.secondary,
			'other': boosts.other
		};

		let baseTarget = totalScore/10;
		let primeTarget = 4000;
		if (baseTarget >= 6000)
			primeTarget = 12000; // 12 hours
		else if (baseTarget >= 4000)
			primeTarget = 10000; // 10 hours
		else if (baseTarget >= 2000)
			primeTarget = 8000; // 8 hours
		else if (baseTarget >= 1000)
			primeTarget = 6000; // 6 hours

		let primaryDeviation = (primaryScore-primeTarget)/baseTarget;
		let primaryAdjustment = primaryDeviation.toFixed(1)*finetuneRatio*-1;
		newBoosts.primary += primaryAdjustment;

		let secondaryDeviation = (secondaryScore-primeTarget)/baseTarget;
		let secondaryAdjustment = secondaryDeviation.toFixed(1)*finetuneRatio*-1;
		newBoosts.secondary += secondaryAdjustment;

		// No adjustments made, so stop trying to optimize
		if (primaryAdjustment == 0 && secondaryAdjustment == 0)
			return false;

		return newBoosts;
	}
}

class VoyagersLineup {
	constructor(assignments) {
		const SKILL_IDS = ['command_skill', 'diplomacy_skill', 'security_skill',
							'engineering_skill', 'science_skill', 'medicine_skill'];

		let crew = [];
		let traitsMatched = [];
		let skillScores = {
			'command_skill': 0, 'diplomacy_skill': 0, 'security_skill': 0,
			'engineering_skill': 0, 'science_skill': 0, 'medicine_skill': 0
		};
		let iTotalScore = 0;
		let iBonusTraits = 0;

		for (let i = 0; i < assignments.length; i++) {
			crew.push({
				'id': assignments[i].id,
				'name': assignments[i].name,
				'score': assignments[i].score
			});
			traitsMatched.push(assignments[i].isIdeal ? 1 : 0);
			if (assignments[i].isIdeal) iBonusTraits++;
			for (let iSkill = 0; iSkill < SKILL_IDS.length; iSkill++) {
				if (!assignments[i].skills[SKILL_IDS[iSkill]]) continue;
				let skill = assignments[i].skills[SKILL_IDS[iSkill]];
				let iSkillScore = skill.core+skill.range_min+(skill.range_max-skill.range_min)/2;
				skillScores[SKILL_IDS[iSkill]] += iSkillScore;
				iTotalScore += iSkillScore;
			}
		}
		for (let iSkill = 0; iSkill < SKILL_IDS.length; iSkill++) {
			skillScores[SKILL_IDS[iSkill]] = Math.floor(skillScores[SKILL_IDS[iSkill]]);
		}

		this._crew = crew;
		this._traits = traitsMatched;
		this._skills = skillScores;
		this._score = iTotalScore;
		this._antimatter = iBonusTraits*25;
	}

	get crew() {
		return this._crew;
	}

	get traits() {
		return this._traits;
	}

	get skills() {
		return this._skills;
	}

	get score() {
		return this._score;
	}

	get antimatter() {
		return this._antimatter;
	}
}

class VoyagersEstimates {
	constructor(manifest, calculator) {
		const SKILL_IDS = ['command_skill', 'diplomacy_skill', 'security_skill',
							'engineering_skill', 'science_skill', 'medicine_skill'];

		let ps, ss, os = 0, others = [];
		for (let iSkill = 0; iSkill < SKILL_IDS.length; iSkill++) {
			if (SKILL_IDS[iSkill] == manifest.voyage.skills.primary_skill)
				ps = manifest.lineup.skills[SKILL_IDS[iSkill]];
			else if (SKILL_IDS[iSkill] == manifest.voyage.skills.secondary_skill)
				ss = manifest.lineup.skills[SKILL_IDS[iSkill]];
			else {
				os += manifest.lineup.skills[SKILL_IDS[iSkill]];
				others.push(manifest.lineup.skills[SKILL_IDS[iSkill]]);
			}
		}

		let config = {
			'startAm': manifest.ship.antimatter + manifest.lineup.antimatter,
			'ps': ps,
			'ss': ss,
			'os': os,
			'others': others
		};
		this._estimates = calculator(config);
	}

	get time() {
		// Use Datacore hack when possible
		if (this._estimates.safeResult)
			return (this._estimates.result*3+this._estimates.safeResult)/4;
		else if (this._estimates.results)
			return this._estimates.result;
		return this._estimates;
	}

	print(time = false) {
		if (!time) time = this.time;
		let hours = Math.floor(time);
		let minutes = Math.floor((time-hours)*60);
		return hours+"h " +minutes+"m";
	}

	printResult(result) {
		let time = this._estimates[result];
		if (time) return this.print(time);
		return false;
	}

	printChances() {
		let sChances = "";
		if (this._estimates.saferResult)
			sChances = "99% worst case: "+this.printResult('saferResult');
		if (this._estimates.dilChance && this._estimates.lastDil) {
			if (sChances != "") sChances += ", ";
			sChances += this._estimates.dilChance+"% chance to reach "+this._estimates.lastDil+"h dilemma";
		}
		return sChances;
	}
}