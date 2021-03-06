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

const STTATWEB_VERSION = 0.12;

const SKILL_IDS = ['command_skill', 'diplomacy_skill', 'security_skill',
					'engineering_skill', 'science_skill', 'medicine_skill'];

const SHORT_SKILLS = {
	'command_skill': 'CMD',
	'diplomacy_skill': 'DIP',
	'security_skill': 'SEC',
	'engineering_skill': 'ENG',
	'science_skill': 'SCI',
	'medicine_skill': 'MED'
};

var sttat = false;
var sttatSession = {};
var debugCallback = debug;

function async(aFunction, callback = null) {
	setTimeout(function() {
		aFunction();
		if (callback) {callback();}
	}, 250);
}

/* Status Toast */
var _dismissTimer = false;
function showStatus(message) {
	let status = document.getElementById('status');
	status.innerHTML = message;
	status.classList.add('showing', 'working');
	status.classList.remove('success', 'failure');
	status.removeEventListener('click', closeStatus);
	if (_dismissTimer) clearTimeout(_dismissTimer);
}
function showFinalStatus(message = false, success = true, autodismiss = true) {
	let status = document.getElementById('status');
	if (message) status.innerHTML = message;
	status.classList.remove('working');
	status.classList.add('showing', success ? 'success' : 'failure');
	status.addEventListener('click', closeStatus);
	if (autodismiss) {
		// Enable auto-close after 2 seconds
		_dismissTimer = setTimeout(function() {
			['click', 'keydown', 'mousemove', 'scroll', 'touchstart'].forEach(
				function (item) {
					document.body.addEventListener(item, closeStatus);
				}
			);
		}, 2000);
	}
}
function closeStatus() {
	let status = document.getElementById('status');
	status.innerHTML = "";
	status.classList.remove('showing');
	document.body.removeEventListener('click', closeStatus);
	['click', 'keydown', 'mousemove', 'scroll', 'touchstart'].forEach(
		function (item) {
			document.body.removeEventListener(item, closeStatus);
		}
	);
	if (_dismissTimer) clearTimeout(_dismissTimer);
}

/* Assimilator */
function onDataInput() {
	showStatus("Loading file. Please wait...");
	document.getElementById('assimilatorStarter').disabled = true;
	let fp = document.getElementById('datainput');
	let fr = new FileReader();
	fr.onload = function()
	{
		sttatSession.input = fr.result;
		let clipped = sttatSession.input.substr(0, 500)+" [...]";
		document.getElementById('datatext').value = clipped;
		startAssimilating();
	};
	fr.readAsText(fp.files[0]);
}

function onDataPaste(event) {
	showStatus("Pasting. Please wait...");
	document.getElementById('assimilatorStarter').disabled = true;
	let paste = event.clipboardData || window.clipboardData;
	if (paste) {
		sttatSession.input = paste.getData('text');
		let clipped = sttatSession.input.substr(0, 500)+" [...]";
		document.getElementById('datatext').value = clipped;
		startAssimilating();
		event.preventDefault();
		return false;
	}
	return true;
}

function startAssimilating() {
	showStatus("Preparing to import data...");
	let config = {
		'progressCallback': showStatus,
		'debugCallback': debugCallback,
		'dispatcher': 'sttat-web',
		'dispatcherVersion': STTATWEB_VERSION
	};
	if (sttatSession.input == "") sttatSession.input = document.getElementById('datatext').value;
	let assimilator = new Assimilator(config, sttat);
	assimilator.parse(sttatSession.input)
		.then((assimilated) => {
			sttat = assimilated.data;
			expertSave();
			sttatSession.voyageExcludeIds = false;
			readyCrewFinder();
			readyVoyagersForm();
			readyDataCore();
			if (assimilated.type == 'player') {
				writeUpdateTime(false);
				showFinalStatus("Rosters successfully imported!");
			}
			else if (assimilated.type == 'datacore') {
				writeUpdateTime(true);
				showFinalStatus("DataCore successfully imported!");
			}
			document.getElementById('datatext').value = "";
			document.getElementById('datainput').value = "";
			document.getElementById('first').scrollIntoView();
		})
		.catch((error) => {
			showFinalStatus(error, false, false);
		})
		.finally(() => {
			sttatSession.input = "";
			document.getElementById('assimilatorStarter').disabled = false;
		});
}

/* DataCore */
function readyDataCore() {
	if (!sttat || sttat.datacore)
		document.getElementById('datacore').classList.add('hide');
	else
		document.getElementById('datacore').classList.remove('hide');
	if (!sttat || !sttat.datacore) {
		document.getElementById('optionrow-frozen').classList.add('hide');
		document.getElementById('retriever').classList.add('hide');
	}
	else {
		document.getElementById('optionrow-frozen').classList.remove('hide');
		document.getElementById('retriever').classList.remove('hide');
	}
}

/* Aggregates */
function aggregateTraits() {
	let crewtraits = [];
	for (let i = 0; i < sttat.crew.length; i++) {
		['traits', 'traits_hidden'].forEach(traitlist => {
			for (let t = 0; t < sttat.crew[i][traitlist].length; t++) {
				let traitname = sttat.crew[i][traitlist][t];
				let existing = crewtraits.find(trait => trait.name == traitname);
				if (!existing) {
					crewtraits.push({
						'id': crewtraits.length,
						'name': traitname,
						'hidden': traitlist == 'traits_hidden' ? true : false
					});
				}
			}
		});
	}
	sttatSession.crewtraits = crewtraits;
	crewtraits.sort((a, b) => a.name.localeCompare(b.name));
	let dlTraits = document.getElementById('traits');
	crewtraits.forEach(trait => {
		let option = document.createElement('option');
		option.setAttribute('value', trait.name);
		dlTraits.appendChild(option);
	});
}

/* Voyagers */
function readyVoyagersForm() {
	if (!sttat) {
		showFinalStatus("Please import rosters first.", false, false);
		return;
	}

	let voyage = sttat.voyage;

	let inputPrimary = document.getElementById('in-primaryskill');
	inputPrimary.value = voyage.skills.primary_skill;
	let inputSecondary = document.getElementById('in-secondaryskill');
	inputSecondary.value = voyage.skills.secondary_skill;

	let shipTraits = ['','andorian','battlecruiser','borg','breen','cardassian','emp','explorer','federation','ferengi','freighter','hologram','klingon','maquis','orion_syndicate','pioneer','romulan','ruthless','scout','spore_drive','terran','tholian','transwarp','vulcan','warship','war_veteran','xindi'];
	let selectST = document.createElement('select');
	for (let t = 0; t < shipTraits.length; t++) {
		let option = document.createElement('option');
		option.text = shipTraits[t];
		selectST.appendChild(option);
	}
	selectST.value = voyage.ship_trait;
	selectST.id = 'in-shiptrait';
	document.getElementById('in-shiptrait').replaceWith(selectST);

	let crewTraits = ['','android','astrophysicist','bajoran','borg','brutal','cardassian','civilian','communicator','costumed','crafty','cultural_figure','cyberneticist','desperate','diplomat','doctor','duelist','exobiology','explorer','federation','ferengi','gambler','hero','hologram','human','hunter','innovator','inspiring','jury_rigger','klingon','marksman','maverick','physician','pilot','prodigy','resourceful','romantic','romulan','saboteur','scoundrel','starfleet','survivalist','tactician','telepath','undercover_operative','veteran','villain','vulcan'];
	let selectCTDefault = document.createElement('select');
	for (let t = 0; t < crewTraits.length; t++) {
		let option = document.createElement('option');
		option.text = crewTraits[t];
		selectCTDefault.appendChild(option);
	}
	for (let i = 0; i < voyage.crew_slots.length; i++) {
		let selectCT = selectCTDefault.cloneNode(true);
		selectCT.value = voyage.crew_slots[i].trait;
		selectCT.id = 'in-trait['+i+']';
		document.getElementById(selectCT.id).replaceWith(selectCT);
	}

	let excludeCrew = [];
	// Use most recent exclude list, if one exists
	if (sttatSession.voyageExcludeIds) {
		for (let i = 0; i < sttatSession.voyageExcludeIds.length; i++) {
			let excluded = sttat.crew.find(crewman => crewman.id == sttatSession.voyageExcludeIds[i]);
			excludeCrew.push({'id': excluded.id, 'name': excluded.name});
		}
	}
	// Otherwise get excludes by event and active
	else if (sttat.weekend.exclusive && sttat.weekend.crew) {
		for (let i = 0; i < sttat.weekend.crew.length; i++) {
			let excluded = sttat.crew.filter(crewman => crewman.symbol == sttat.weekend.crew[i].symbol);
			excluded.forEach(crewman => {excludeCrew.push({'id': crewman.id, 'name': crewman.name});});
		}
		for (let i = 0; i < sttat.crew.length; i++) {
			// Active status 	0: available
			//					2: on shuttle
			//					3: on voyage (assume available again here)
			if (sttat.crew[i].active_status == 2) {
				let excluded = excludeCrew.find(crewman => crewman.id == sttat.crew[i].id);
				if (!excluded) {
					excluded = sttat.crew.find(crewman => crewman.id == sttat.crew[i].id);
					excludeCrew.push({'id': excluded.id, 'name': excluded.name});
				}
			}
		}
	}
	if (excludeCrew.length > 0) {
		document.getElementById('voyageExcludeList').innerHTML = "";
		excludeCrew.sort((a, b) => a.name.localeCompare(b.name));
		for (let i = 0; i < excludeCrew.length; i++) {
			let a = document.createElement('a');
			a.id = 'exclude_'+excludeCrew[i].id;
			a.innerHTML = excludeCrew[i].name;
			a.setAttribute('crewId', excludeCrew[i].id);
			a.setAttribute('title', 'Click to remove from exclude list');
			a.setAttribute('href', '#');
			a.setAttribute('onclick', 'return excludeFromExcludes('+excludeCrew[i].id+');');
			document.getElementById('voyageExcludeList').appendChild(a);
		}
		document.getElementById('voyageExcludes').classList.remove('hide');
	}
	else {
		document.getElementById('voyageExcludes').classList.add('hide');
	}

	/*
	// If prime skills target generalists (CMD, DIP, SEC),
	//	favor voyagers who would be specialists (have at least 1 of ENG, SCI, MED)
	if (voyage.skills.primary_skill == "command_skill" || voyage.skills.secondary_skill == "command_skill"
		|| voyage.skills.primary_skill == "diplomacy_skill" || voyage.skills.secondary_skill == "diplomacy_skill"
		|| voyage.skills.primary_skill == "security_skill" || voyage.skills.secondary_skill == "security_skill") {
		document.getElementById('in-specialists').checked = true;
	}
	else {
		document.getElementById('in-specialists').checked = false;
	}
	*/

	document.getElementById('voyagerStarter').disabled = false;
	document.getElementById('voyageInput').classList.remove('hide');
	document.getElementById('voyageOutput').classList.add('hide');
	document.getElementById('voyagers').classList.remove('hide');
}

function writeUpdateTime(bFromLocal = false) {
	let assimilatorTime = new Date(sttat.meta.import_date);
	let message = "Your rosters are current as of <b>"+assimilatorTime.toLocaleString()+"</b>.";
	if (bFromLocal)
		message += " <br/>(<a href=\"#assimilator\">Import Rosters</a> to update)";
	document.getElementById('datadetected').innerHTML = message;
}

function clearAllTraits() {
	for (let i = 0; i < 12; i++) {
		let select = document.getElementById('in-trait['+i+']');
		select.value = "";
	}
	return false;
}

function clearAllExcludes() {
	document.getElementById('voyageExcludeList').innerHTML = "";
	return false;
}

function excludeFromExcludes(id) {
	let item = document.getElementById('exclude_'+id);
	if (item) document.getElementById('voyageExcludeList').removeChild(item);
	return false;
}

function startVoyagers() {
	if (!sttat) {
		showFinalStatus("Please import rosters first.", false, false);
		return;
	}

	let skills = {
		'primary_skill': document.getElementById('in-primaryskill').value,
		'secondary_skill': document.getElementById('in-secondaryskill').value
	};
	if (skills.primary_skill == "" || skills.secondary_skill == ""
		|| skills.primary_skill == skills.secondary_skill) {
		showFinalStatus("Please select two different skills.", false, false);
		return;
	}

	showStatus("Preparing to recommend voyagers...");
	document.getElementById("voyagerStarter").disabled = true;

	let slots = [];
	for (let i = 0; i < 12; i++) {
		let trait = document.getElementById('in-trait['+i+']').value;
		slots.push({'trait': trait});
	}

	let excludeIds = [];
	let excludeList = document.getElementById('voyageExcludeList');
	let excludeItems = excludeList.getElementsByTagName("a");
	for (let i = 0; i < excludeItems.length; i++) {
		excludeIds.push(parseInt(excludeItems[i].getAttribute('crewId')));
	}
	sttatSession.voyageExcludeIds = excludeIds;

	// Crew is required to instantiate, config is for showing progress (optional)
	let crew = sttat.crew;
	let config = {
		'progressCallback': showStatus,
		'debugCallback': debugCallback
	};
	// Voyage data is required to assemble lineups
	let voyage = {
		'skills': skills,
		'crew_slots': slots,
		'ship_trait': document.getElementById('in-shiptrait').value
	};
	// Function to filter out crew you don't want to consider (optional)
	let filter = filterConsideredCrew;
	// Options modify the calculation algorithm (optional)
	let options = {
		'initBoosts': { 'primary': 3.5, 'secondary': 2.5, 'other': 1.0 },
		'searchVectors': document.getElementById('in-vectors').value,
		'luckFactor': document.getElementById('in-luckfactor').checked,
		'favorSpecialists': document.getElementById('in-specialists').checked
	};
	async(function() {
		const ship = getBestVoyageShip(sttat.ships, voyage.ship_trait);
		// Assemble a few lineups that match input
		const voyagers = new Voyagers(crew, config);
		voyagers.assemble(voyage, filter, options)
			.then((lineups) => {
				// Now figure out which lineup is "best"
				showStatus("Estimating voyage time. Please wait...");
				const analyzer = new VoyagersAnalyzer(voyage, ship, lineups);
				analyzer.analyze(ChewableEstimator, chewableSorter)
					.then(([lineup, estimate]) => {
						showStatus("Ready to voyage!");
						showRecommendation(voyage, ship, lineup, estimate);
					});
			})
			.catch((error) => {
				showFinalStatus(error, false, false);
				readyVoyagersForm();
			});
	});
}

function getBestVoyageShip(ships, shiptrait) {
	let consideredShips = [];
	for (let i = 0; i < ships.length; i++) {
		let ship = {
			'id': ships[i].id,
			'name': ships[i].name,
			'antimatter': ships[i].antimatter,
			'isIdeal': false
		};
		let traits = ships[i].traits;
		if (traits.find(trait => trait == shiptrait)) {
			ship.antimatter += 150;
			ship.isIdeal = true;
		}
		consideredShips.push(ship);
	}
	consideredShips.sort((a, b) => b.antimatter - a.antimatter);
	return consideredShips[0];
}

function filterConsideredCrew(crew) {
	if (sttatSession.voyageExcludeIds.indexOf(crew.id) >= 0)
		return true;
	if (!document.getElementById('in-frozen').checked && crew.frozen)
		return true;
	if (document.getElementById('in-immortals').checked && crew.immortal)
		return true;
	if (document.getElementById('in-maxrarity').value && crew.max_rarity > document.getElementById('in-maxrarity').value)
		return true;
	return false;
}

function chewableSorter(a, b) {
	const playItSafe = document.getElementById('in-luckfactor').checked;

	let aEstimate = a.estimate.refills[0];
	let bEstimate = b.estimate.refills[0];

	// Return best average (w/ DataCore pessimism) by default
	let aAverage = (aEstimate.result*3+aEstimate.safeResult)/4;
	let bAverage = (bEstimate.result*3+bEstimate.safeResult)/4;

	if (playItSafe || aAverage == bAverage)
		return bEstimate.saferResult - aEstimate.saferResult;

	return bAverage - aAverage;
}

function showRecommendation(voyage, ship, lineup, estimate) {
	// Remember voyage details for next recommendation
	//	Manifest (i.e. actual recommendations) is not saved
	sttat.voyage = voyage;
	expertSave();

	document.getElementById('out-ship').innerHTML = ship.name;
	document.getElementById('out-shipindex').innerHTML = getShipIndex(ship.id);
	let sShipTrait = voyage.ship_trait;
	if (ship.isIdeal) sShipTrait += " &check;";
	document.getElementById('out-shiptrait').innerHTML = sShipTrait;
	document.getElementById('out-antimatter').innerHTML = ship.antimatter + lineup.antimatter;
	document.getElementById('out-antimatter').setAttribute('title', ship.antimatter+' from the ship + '+lineup.antimatter+' from the crew');
	for (let iSkill = 0; iSkill < SKILL_IDS.length; iSkill++) {
		let skill = SKILL_IDS[iSkill];
		let tdSkill = document.getElementById('out-skill['+skill+']');
		tdSkill.innerHTML = Math.floor(lineup.skills[skill]);
		if (skill == voyage.skills.primary_skill
			|| skill == voyage.skills.secondary_skill) {
			tdSkill.classList.add('prime');
		}
		else {
			tdSkill.classList.remove('prime');
		}
	}
	let sEstimate = "";
	if (estimate) {
		// DataCore is slightly more pessimistic than Chewable
		let voyTime = (estimate.refills[0].result*3+estimate.refills[0].safeResult)/4;
		sEstimate = "Estimated voyage length: <b>"+printTime(voyTime) + "</b>";
		let sChances = "";
		if (estimate.refills[0].saferResult)
			sChances = "(99% worst case "+printTime(estimate.refills[0].saferResult)+")";
		if (estimate.refills[0].dilChance && estimate.refills[0].lastDil) {
			if (sChances != "") sChances += ". ";
			sChances += estimate.refills[0].dilChance+"% chance to reach "+estimate.refills[0].lastDil+"h dilemma;";
			sChances += " refill with "+estimate.refills[1].refillCostResult+" dilithium for a "+estimate.refills[1].dilChance+"% chance to reach the "+estimate.refills[1].lastDil+"h dilemma.";
		}
		if (sChances != "") sEstimate += " "+sChances;
	}
	document.getElementById("voyageEstimate").innerHTML = sEstimate;

	for (let i = 0; i < lineup.crew.length; i++) {
		let bonus = lineup.traits[i] ? " &check;" : "";
		let trait = voyage.crew_slots[i].trait;
		document.getElementById('out-matched['+i+']').innerHTML = trait+bonus;
		document.getElementById('out-crew['+i+']').innerHTML = "";
		let span = document.createElement('span');
		span.id = 'assigned['+i+']';
		span.innerHTML = lineup.crew[i].name;
		span.setAttribute('crewId', lineup.crew[i].id);
		document.getElementById('out-crew['+i+']').appendChild(span);
	}

	document.getElementById('voyageOutput').classList.remove('hide');
	document.getElementById('voyageInput').classList.add('hide');
	document.getElementById('voyagers').scrollIntoView();
	showFinalStatus();
}

function getShipIndex(id) {
	let iShipCount = sttat.ships.length;
	let index = {};
	if (id == 0)
		index = {'left': 1, 'right': iShipCount-1};
	else if (id == 1)
		index = {'left': 0, 'right': 0};
	else
		index = {'left': (iShipCount-id+1), 'right': id-1};
	let sShipIndex = "&larr;" + index.left;
	if (index.right < index.left)
		sShipIndex = index.right + "&rarr;";
	return sShipIndex;
}

function showVoyagerCard(slot) {
	let span = document.getElementById('assigned['+slot+']');
	let a = document.createElement('a');
	a.href = "#";
	a.setAttribute('onclick', "return excludeSlot("+slot+");");
	if (span.classList.contains('strike'))
		a.innerHTML = "Remove "+span.innerHTML+" from exclude list";
	else
		a.innerHTML = "Exclude "+span.innerHTML+"<br/>from next voyage recommendation";
	showCard(span.getAttribute('crewId'), a);
}

function excludeSlot(slot) {
	document.getElementById('assigned['+slot+']').classList.toggle('strike');
	hideCard();
	return false;
}

function printTime(time) {
	let hours = Math.floor(time);
	let minutes = Math.floor((time-hours)*60);
	return hours+"h " +minutes+"m";
}

function editVoyage() {
	for (let i = 0; i < 12; i++) {
		let span = document.getElementById('assigned['+i+']');
		if (span.classList.contains('strike')) {
			sttat.voyage._manual_excludes.push(span.getAttribute('crewId'));
		}
	}
	readyVoyagersForm();
	document.getElementById('voyagers').scrollIntoView();
}

/* Crew Finder */
function readyCrewFinder() {
	if (!sttat) return;
	if (!sttat.aggregates) aggregateTraits();
	findCrew();
	document.getElementById('finder').classList.remove('hide');
}

function onTraitInput(event) {
	if (event.inputType == 'insertReplacementText') {
		if (document.getElementById('filterAccepted').childNodes.length > 0) {
			if (canAddAsTraitCriteria()) {
				addTraitCriteria();
				return;
			}
		}
	}
	findCrew();
}

function canAddAsTraitCriteria() {
	let trait = document.getElementById('filter-trait').value;
	if (trait == "") return false;

	let a = document.getElementById('filterAccepted').getElementsByTagName('a');
	for (let t = 0; t < a.length; t++) {
		if (a[t].innerHTML == trait) return false;
	}

	let matching = sttatSession.crewtraits.filter(existing => existing.name == trait);
	if (matching.length != 1) return false;

	return true;
}

function addTraitCriteria() {
	let input = document.getElementById('filter-trait');
	let trait = input.value;
	let a = document.createElement('a');
	a.href = "#";
	a.innerHTML = trait;
	a.setAttribute('onclick', 'return clearTraitCriteria(this);');
	a.setAttribute('title', 'Click to remove trait from search');
	document.getElementById('filterAccepted').appendChild(a);
	input.value = "";
	input.focus();
	findCrew();
	return false;
}

function clearTraitCriteria(a) {
	document.getElementById('filterAccepted').removeChild(a);
	findCrew();
	return false;
}

function setTraitInput(trait) {
	document.getElementById('filter-trait').value = trait;
	findCrew();
	document.getElementById('finder').scrollIntoView();
	hideCard();
	return false;
}

function toggleSkill(skillName) {
	let selected = document.getElementById('select-'+skillName);
	if (selected.classList.contains('select')) {
		selected.classList.remove('select');
		findCrew();
	}
	else {
		let div = document.getElementById('skillSelect');
		let a = div.getElementsByClassName('select');
		if (a.length < parseInt(document.getElementById('max-skills').innerHTML)) {
			selected.classList.add('select');
			findCrew();
		}
	}
	return false;
}

function findAllCrew() {
	findCrew(false);
	return false;
}

function findCrew(bLimit = true) {
	let iScoreType = document.getElementById('sort-score').value;
	let iMaxSkills = 3;
	if (iScoreType == 2)
		iMaxSkills = 2;
	else if (iScoreType == 3)
		iMaxSkills = 1;
	document.getElementById('max-skills').innerHTML = iMaxSkills;

	let traits = [];
	let bFindAllTraits = false;
	let accepted = document.getElementById('filterAccepted')
					.getElementsByTagName('a');
	if (accepted.length > 0) {
		for (let t = 0; t < accepted.length; t++) {
			traits.push(accepted[t].innerHTML);
		}
		document.getElementById('filterOptionLabel').classList.remove('hide');
		document.getElementById('filterOptionList').classList.remove('hide');
		bFindAllTraits = document.getElementById('filter-all').checked;
	}
	else {
		document.getElementById('filterOptionLabel').classList.add('hide');
		document.getElementById('filterOptionList').classList.add('hide');
	}
	let sTraits = document.getElementById('filter-trait').value;
	if (sTraits != "" && sTraits.trim() != "") {
		let re = new RegExp("^"+sTraits.trim().replace(/\s+/g, '_').replace(/[^A-Za-z0-9_]+/g, ''), 'i');
		let found = sttatSession.crewtraits.filter(trait => re.test(trait.name));
		for (let f = 0; f < found.length; f++) {
			traits.push(found[f].name);
		}
		if (found.length == 0) traits.push('');
		document.getElementById('filter-clear').classList.remove('hide');
		if (canAddAsTraitCriteria()) document.getElementById('filter-add').classList.remove('hide');
	}
	else {
		document.getElementById('filter-add').classList.add('hide');
		document.getElementById('filter-clear').classList.add('hide');
	}

	let div = document.getElementById('skillSelect');
	let a = div.getElementsByClassName('select');
	let skillsRequested = [];
	for (let i = 0; i < a.length; i++) {
		skillsRequested.push(a[i].id.substr(7)+"_skill");
	}

	let filtered = [];
	for (let i = 0; i < sttat.crew.length; i++) {
		let iTotalVoyage = 0;
		let iMatchedVoyage = 0, iMatchedSkills = 0;
		let iBestShuttle = 0, iBestShuttleIndex = -1, rMatchedShuttleSkills = [];
		let iBestGauntlet = 0, iBestGauntletIndex = -1, rMatchedGauntletSkills = [];
		for (let iSkill = 0; iSkill < SKILL_IDS.length; iSkill++) {
			let skillId = SKILL_IDS[iSkill];
			if (!sttat.crew[i].skills[skillId]) continue;
			let iSkillShuttle = sttat.crew[i].skills[skillId].core;
			if (iSkillShuttle > iBestShuttle) {
				iBestShuttle = iSkillShuttle;
				iBestShuttleIndex = iMatchedSkills;
			}
			let iSkillGauntlet = sttat.crew[i].skills[skillId].range_max;
			if (iSkillGauntlet > iBestGauntlet) {
				iBestGauntlet = iSkillGauntlet;
				iBestGauntletIndex = iMatchedSkills;
			}
			let iSkillVoyage = sttat.crew[i].skills[skillId].core
								+ sttat.crew[i].skills[skillId].range_min
								+ (sttat.crew[i].skills[skillId].range_max-sttat.crew[i].skills[skillId].range_min)/2;
			iTotalVoyage += iSkillVoyage;
			if (skillsRequested.length > 0 && skillsRequested.indexOf(skillId) >= 0) {
				iMatchedVoyage += iSkillVoyage;
				rMatchedShuttleSkills.push(iSkillShuttle);
				rMatchedGauntletSkills.push(iSkillGauntlet);
				iMatchedSkills++;
			}
		}

		let iScore = 0;
		// Show best voyage, best shuttle of any skill if none selected
		if (skillsRequested.length == 0) {
			if (iScoreType == 0 || iScoreType == 1)
				iScore = iTotalVoyage;
			else if (iScoreType == 2)
				iScore = iBestShuttle;
			else if (iScoreType == 3)
				iScore = iBestGauntlet;
		}
		else if (iMatchedSkills == skillsRequested.length) {
			if (iScoreType == 0)
				iScore = iTotalVoyage;
			else if (iScoreType == 1)
				iScore = iMatchedVoyage;
			else if (iScoreType == 2 && skillsRequested.length == 1) {
				iScore = rMatchedShuttleSkills[0];
			}
			else if (iScoreType == 2) {
				for (let j = 0; j < rMatchedShuttleSkills.length; j++) {
					if (j == iBestShuttleIndex)
						iScore += rMatchedShuttleSkills[j];
					else
						iScore += rMatchedShuttleSkills[j]/4;
				}
			}
			else if (iScoreType == 3)
				iScore = rMatchedGauntletSkills[iBestGauntletIndex];
		}
		let bConsider = true;
		if (traits.length > 0) {
			bConsider = false;
			let iMatchedTraits = 0;
			for (let t = 0; t < traits.length; t++) {
				if (sttat.crew[i].traits.indexOf(traits[t]) >= 0)
					iMatchedTraits++;
				else if (sttat.crew[i].traits_hidden.indexOf(traits[t]) >= 0)
					iMatchedTraits++;
			}
			if (bFindAllTraits)
				bConsider = iMatchedTraits == traits.length;
			else
				bConsider = iMatchedTraits > 0;
		}
		if (iScore > 0 && bConsider) {
			let sName = sttat.crew[i].name;
			if (sttat.crew[i].copy > 1) sName += " ("+sttat.crew[i].copy+")";
			if (sttat.crew[i].frozen) sName += " [F]";
			let sRarity = '★'.repeat(sttat.crew[i].rarity)
							+'☆'.repeat(sttat.crew[i].max_rarity-sttat.crew[i].rarity);
			let crewman = {
				'id': sttat.crew[i].id,
				'name': sName,
				'rarity': sRarity,
				'score': Math.floor(iScore)
			};
			filtered.push(crewman);
		}
	}
	filtered.sort((a, b) => b.score - a.score);
	let tableColumns = [{'id': 'name', 'title': 'Name', 'class': ''},
					{'id': 'rarity', 'title': 'Rarity', 'class': 'rarity'},
					{'id': 'score', 'title': 'Score', 'class': 'score'}];
	updateFinderTable(filtered, tableColumns, bLimit);
}

function updateFinderTable(tableData, tableColumns, bLimit)
{
	let iLimit = Math.min(tableData.length, 20);
	if (!bLimit) iLimit = tableData.length;

	let table = document.createElement('table');
	let tHead = document.createElement('thead');
	let trHead = document.createElement('tr');
	for (let i = 0; i < tableColumns.length; i++)
	{
		let thHead = document.createElement('th');
		thHead.innerHTML = tableColumns[i].title;
		trHead.appendChild(thHead);
	}
	tHead.appendChild(trHead);
	table.appendChild(tHead);

	let tBody = document.createElement('tbody');
	for (let i = 0; i < iLimit; i++)
	{
    let tr = document.createElement('tr');
		tr.className = 'clickable';
		tr.setAttribute('onclick', 'showCard('+tableData[i].id+');');
		for (let j = 0; j < tableColumns.length; j++)
		{
			let td = document.createElement('td');
			td.innerHTML = tableData[i][tableColumns[j].id];
			td.className = tableColumns[j].class;
			tr.appendChild(td);
		}
		tBody.appendChild(tr);
	}
	table.appendChild(tBody);
	table.className = "databox";

	let showing = document.createElement('div');
	showing.className = "optionspostnote";
	if (tableData.length <= iLimit)
		showing.innerHTML = "Showing all "+tableData.length+" matching crew.";
	else
		showing.innerHTML = "Showing 20 of "+tableData.length+" matching crew. <a href=\"#\" onclick=\"return findAllCrew();\">Show all</a>.";

	let divTable = document.getElementById('finderResults');
	divTable.innerHTML = "";
	divTable.appendChild(table);
	divTable.appendChild(showing);
}

function showCard(crewId, action = false) {
	if (!sttat) return;

	let card = document.getElementById('card');
	if (card.getAttribute('crewId') == crewId)
	{
		hideCard();
		return;
	}

	let carded = sttat.crew.find(crewman => crewman.id == crewId);
	card.setAttribute('crewId', crewId);
	card.className = "rarity-"+carded.max_rarity;
	document.getElementById('card-name').innerHTML = carded.name;
	document.getElementById('card-rarity').innerHTML = '★'.repeat(carded.rarity)
		+'☆'.repeat(carded.max_rarity-carded.rarity);
	let sLevel = "Level "+carded.level;
	if (carded.frozen)
		sLevel = "Immortal [Frozen]";
	else if (carded.immortal)
		sLevel = "Immortal";
	document.getElementById('card-level').innerHTML = sLevel;
	let tbody = document.createElement('tbody');
	tbody.id = 'card-skills';

	let scores = {
		'best': {'skill': '', 'core': 0, 'average': 0},
		'better': {'skill': '', 'core': 0, 'average': 0},
		'good': {'skill': '', 'core': 0, 'average': 0}
	};
	let iVoyage = 0;
	for (let iSkill = 0; iSkill < SKILL_IDS.length; iSkill++) {
		let skillId = SKILL_IDS[iSkill];
		if (!carded.skills[skillId]) continue;
		let core = carded.skills[skillId].core;
		let average = carded.skills[skillId].core
						+ carded.skills[skillId].range_min
						+ (carded.skills[skillId].range_max-carded.skills[skillId].range_min)/2;
		if (core > scores.best.core) {
			scores.good = scores.better;
			scores.better = scores.best;
			scores.best = {'skill': skillId, 'core': core, 'average': average};
		}
		else if (core > scores.better.core) {
			scores.good = scores.better;
			scores.better = {'skill': skillId, 'core': core, 'average': average};
		}
		else {
			scores.good = {'skill': skillId, 'core': core, 'average': average};
		}
		iVoyage += average;
	}
	for (let score in scores) {
		if (scores.hasOwnProperty(score)) {
			if (scores[score].core == 0) break;
			let skillId = scores[score].skill;
			let tr = document.createElement('tr');
			let tdSkill = document.createElement('td');
			tdSkill.className = 'seat';
			tdSkill.innerHTML = SHORT_SKILLS[skillId];
			let tdCore = document.createElement('td');
			tdCore.className = 'score';
			tdCore.innerHTML = scores[score].core;
			let tdRange = document.createElement('td');
			tdRange.className = 'range';
			tdRange.innerHTML = carded.skills[skillId].range_min+"-"+carded.skills[skillId].range_max;
			let tdAverage = document.createElement('td');
			tdAverage.className = 'score';
			tdAverage.innerHTML = scores[score].average;
			let tdRank = document.createElement('td');
			tdRank.className = 'rank';
			tdRank.innerHTML = getVoyageRank(scores[score].average, skillId);
			tr.append(tdSkill, tdCore, tdRange, tdAverage, tdRank);
			tbody.appendChild(tr);
		}
	}

	document.getElementById('card-voyage').innerHTML = Math.floor(iVoyage);
	document.getElementById('card-voyagerank').innerHTML = getVoyageRank(iVoyage);

	let sTraits = "";
	// Get variant names from traits_hidden
	let ignore = [
		'tos','tas','tng','ds9','voy','ent','dsc','pic',
		'female','male',
		'artificial_life','nonhuman','organic','species_8472',
		'admiral','captain','commander','lieutenant_commander','lieutenant','ensign','general','nagus','first_officer',
		'ageofsail','bridge_crew','evsuit','gauntlet_jackpot','mirror','niners','original',
		'crew_max_rarity_5','crew_max_rarity_4','crew_max_rarity_3','crew_max_rarity_2','crew_max_rarity_1',
		'spock_tos' /* 'spock_tos' Spocks also have 'spock' trait so use that and ignore _tos for now */
	];
	for (let i = 0; i < carded.traits_hidden.length; i++) {
		let trait = carded.traits_hidden[i];
		if (ignore.indexOf(trait) == -1) {
			if (sTraits != "") sTraits += ", ";
			sTraits += "<a href=\"#\" onclick=\"return setTraitInput('"+trait+"');\">"+trait+"</a>";
		}
	}
	for (let t = 0; t < carded.traits.length; t++) {
		let trait = carded.traits[t];
		if (sTraits != "") sTraits += ", ";
		sTraits += "<a href=\"#\" onclick=\"return setTraitInput('"+trait+"');\">"+trait+"</a>";
	}
	document.getElementById('card-traits').innerHTML = sTraits;

	let actions = document.getElementById('card-actions');
	let references = document.getElementById('card-references');
	actions.innerHTML = '';
	references.innerHTML = '';
	if (action) {
		actions.appendChild(action);
	}
	else {
		let wiki = document.createElement('a');
		wiki.href = "https://stt.wiki/wiki/"+carded.name.replace(/\s/g, '_');
		wiki.innerHTML = "View on Timelines Wiki";
		wiki.setAttribute('target', '_blank');
		let dc = document.createElement('a');
		dc.href = "https://datacore.app/crew/"+carded.symbol.replace(/\s/g, '_');
		dc.innerHTML = "View on Datacore";
		dc.setAttribute('target', '_blank');
		references.append(wiki, dc);
	}

	document.getElementById('card-skills').replaceWith(tbody);

	card.classList.add('showing');
}

function getVoyageRank(score, field = '') {
	let filtered = sttat.crew.filter(crewman => {
		if (field == '') {
			let iVoyage = 0;
			for (let iSkill = 0; iSkill < SKILL_IDS.length; iSkill++) {
				let skillId = SKILL_IDS[iSkill];
				if (!crewman.skills[skillId]) continue;
				let core = crewman.skills[skillId].core;
				let average = crewman.skills[skillId].core
								+ crewman.skills[skillId].range_min
								+ (crewman.skills[skillId].range_max-crewman.skills[skillId].range_min)/2;
				iVoyage += average;
			}
			return iVoyage > score;
		}
		else {
			if (!crewman.skills[field]) return false;
			let average = crewman.skills[field].core
							+ crewman.skills[field].range_min
							+ (crewman.skills[field].range_max-crewman.skills[field].range_min)/2;
			return average > score;
		}
	});
	return filtered.length+1;
}

function hideCard() {
	let card = document.getElementById('card');
	card.classList.remove('showing');
	card.removeAttribute('crewId');
	return false;
}

/* Retriever */
function onRetrieveInput(event) {
	let dlAllCrew = document.getElementById('allcrew');
	if (dlAllCrew.childNodes.length == 0) {
		sttat.datacore.sort((a, b) => a.name.localeCompare(b.name));
		sttat.datacore.forEach(crewman => {
			let option = document.createElement('option');
			option.setAttribute('value', crewman.name);
			dlAllCrew.appendChild(option);
		});
	}
	retrieveCrew();
}

function retrieveCrew() {
	function addPolestar(type, typeId) {
		let a = document.createElement('a');
		a.id = 'exclude_'+typeId;
		a.innerHTML = typeId;
		a.setAttribute('type', 'trait');
		a.setAttribute('typeId', typeId);
		a.setAttribute('title', 'Click to toggle polestar');
		a.setAttribute('href', '#');
		a.setAttribute('onclick', 'return togglePolestar(\''+typeId+'\');');
		document.getElementById('polestarSelect').appendChild(a);
	}

	let sCrewName = document.getElementById('retrieve-name').value;
	let wanted = sttat.datacore.find(crew => crew.name.toLowerCase() == sCrewName.toLowerCase());
	if (!wanted) return;

	document.getElementById('polestarSelect').innerHTML = "";
	for (let t = 0; t < wanted.traits.length; t++) {
		addPolestar('trait', wanted.traits[t]);
	}
	addPolestar('rarity', 'crew_max_rarity_'+wanted.max_rarity);
	for (let skill in wanted.skills) {
		addPolestar('skill', skill);
	}

	sttatSession.retriever = getAllPolestarCounts(wanted.traits, wanted.max_rarity, wanted.skills);
	optimizePolestars();
}

function optimizePolestars() {
	let excludePolestars = [];
	let polestarList = document.getElementById('polestarSelect');
	let polestarItems = polestarList.getElementsByTagName("a");
	for (let i = 0; i < polestarItems.length; i++) {
		if (polestarItems[i].classList.contains('strike')) {
			excludePolestars.push(polestarItems[i].getAttribute('typeId'));
		}
	}

	let polestarCounts = sttatSession.retriever.slice();

	// Find optimal polestars, i.e. combinations with best chance of retrieving this crew
	polestarCounts.sort((a, b) => {
		if (a.count == b.count)
			return a.polestars.length - b.polestars.length;
		return a.count - b.count;
	});
	let optimized = [], iBestCount = 10, iBestTraitCount = 4;
	for (let i = 0; i < polestarCounts.length; i++) {
		let testcount = polestarCounts[i];

		// We stop looking for optimals if testcount is:
		//	1) worse than current best count (lower is better)
		if (testcount.count > iBestCount)
			break;
		//	or 2) trait count is 4 and current best trait count is less than 4
		if (testcount.polestars.length == 4 && iBestTraitCount < 4)
			break;

		// Ignore if combination contains any excluded polestars
		let bHasExclude = false;
		excludePolestars.forEach(exclude => {
			if (testcount.polestars.indexOf(exclude) >= 0)
				bHasExclude = true;
		});
		if (bHasExclude) continue;

		if (testcount.count < iBestCount)
			iBestCount = testcount.count;
		if (testcount.polestars.length < iBestTraitCount)
			iBestTraitCount = testcount.polestars.length;

		// Ignore supersets of an already optimal subset
		let bIsSuperset = false;
		for (let j = 0; j < optimized.length; j++) {
			if (testcount.polestars.length <= optimized[j].polestars.length) continue;
			bIsSuperset = true;
			optimized[j].polestars.forEach(polestar => {
				bIsSuperset = bIsSuperset && testcount.polestars.indexOf(polestar) >= 0;
			});
			if (bIsSuperset) break;
		}
		if (bIsSuperset) continue;

		optimized.push({
			'polestars': testcount.polestars,
			'chance': (1/testcount.count*100).toFixed()
		});
	}

	let tableColumns = [{'id': 'chance', 'title': 'Chance', 'class': 'score'},
					{'id': 'polestars', 'title': 'Optimal Polestars', 'class': ''}];
	updateRetrieverTable(optimized, tableColumns, true);
}

function togglePolestar(typeId) {
	document.getElementById('exclude_'+typeId).classList.toggle('strike');
	optimizePolestars();
	return false;
}

function updateRetrieverTable(tableData, tableColumns, bLimit) {
	let iLimit = Math.min(tableData.length, 20);
	if (!bLimit) iLimit = tableData.length;

	let table = document.createElement('table');
	let tHead = document.createElement('thead');
	let trHead = document.createElement('tr');
	for (let i = 0; i < tableColumns.length; i++)
	{
		let thHead = document.createElement('th');
		thHead.innerHTML = tableColumns[i].title;
		trHead.appendChild(thHead);
	}
	tHead.appendChild(trHead);
	table.appendChild(tHead);

	let tBody = document.createElement('tbody');
	for (let i = 0; i < iLimit; i++)
	{
    let tr = document.createElement('tr');
		tr.className = 'clickable';
		for (let j = 0; j < tableColumns.length; j++)
		{
			let td = document.createElement('td');
			td.innerHTML = tableData[i][tableColumns[j].id];
			td.className = tableColumns[j].class;
			tr.appendChild(td);
		}
		tBody.appendChild(tr);
	}
	table.appendChild(tBody);
	table.className = "databox";

	let showing = document.createElement('div');
	showing.className = "optionspostnote";
	/*
	if (tableData.length <= iLimit)
		showing.innerHTML = "Showing all "+tableData.length+" combinations.";
	else
		showing.innerHTML = "Showing 20 of "+tableData.length+" combinations. <a href=\"#\" onclick=\"return retrieveAll();\">Show all</a>.";
	*/

	let divTable = document.getElementById('retrieverResults');
	divTable.innerHTML = "";
	divTable.appendChild(table);
	divTable.appendChild(showing);
}

function getAllPolestarCounts(traits, max_rarity, skills) {
	let polestars = traits.slice();
	polestars.push('crew_max_rarity_'+max_rarity);
	for (let skill in skills) {
		polestars.push(skill);
	}
	let counts = [];
	let f = function(prepoles, traits) {
		for (let t = 0; t < traits.length; t++) {
			const newpoles = prepoles.slice();
			newpoles.push(traits[t]);
			if (newpoles.length <= 4) {
				counts.push({
					'polestars': newpoles,
					'count': 0,
					'matches': []
				});
			}
			f(newpoles, traits.slice(t+1));
		}
	}
	f([], polestars);
	for (let i = 0; i < sttat.datacore.length; i++) {
		if (!sttat.datacore[i].in_portal) continue;
		let traitsInCommon = [];
		for (let t = 0; t < traits.length; t++) {
			if (sttat.datacore[i].traits.indexOf(traits[t]) >= 0)
				traitsInCommon.push(traits[t]);
		}
		if (traitsInCommon.length > 0) {
			if (sttat.datacore[i].max_rarity == max_rarity)
				traitsInCommon.push('crew_max_rarity_'+max_rarity);
			for (let skill in sttat.datacore[i].skills) {
				if (skill in skills) traitsInCommon.push(skill);
			}
			counts.forEach(count => {
				if (traitsInCommon.length >= count.polestars.length) {
					let bMatching = true;
					count.polestars.forEach(polestar => {
						bMatching = bMatching && traitsInCommon.indexOf(polestar) >= 0;
					});
					if (bMatching) {
						count.count++;
						count.matches.push(sttat.datacore[i].symbol);
					}
				}
			});
		}
	}
	return counts;
}

function resetPolestars() {
	let polestarList = document.getElementById('polestarSelect');
	let polestarItems = polestarList.getElementsByTagName("a");
	for (let i = 0; i < polestarItems.length; i++) {
		polestarItems[i].classList.remove('strike');
	}
	return false;
}

/* Export Mode */
function expertSave() {
	if (document.getElementById('expertSaveCheck').checked)
		localStorage.setItem('sttat', JSON.stringify(sttat));
}

function expertLoad() {
	let stored = localStorage.getItem('sttat');
	if (stored)
	{
		sttat = JSON.parse(stored);
		if (sttat.meta.dispatcher_version >= STTATWEB_VERSION) {
			document.getElementById('expertSaveCheck').checked = true;
			writeUpdateTime(true);
			readyVoyagersForm();
			readyCrewFinder();
			readyDataCore();
			showFinalStatus("Rosters loaded from local storage.");
		}
		else {
			showFinalStatus("New version detected. Please import rosters again.", false, false);
		}
	}
}

function expertSaveChange() {
	if (!sttat) return;
	if (document.getElementById('expertSaveCheck').checked)  {
		expertSave();
		showFinalStatus("Rosters saved to local storage.");
	}
	else {
		localStorage.removeItem('sttat');
		showFinalStatus("Rosters forgotten from local storage.");
	}
}

/* Convert ChewableEstimator output for use with STTAT Voyager */
function ChewableConverter(config) {
	let output = ChewableEstimator(config);
	return output.estimates[0];
}

/* Debug */
function debug(message) {
	if (document.getElementById('expertDebugCheck').checked)
		console.log(message);
}