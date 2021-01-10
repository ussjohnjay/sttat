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

const STTATWEB_VERSION = 0.10;

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
var playerData = "";
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
function onFileInput() {
	showStatus("Loading file. Please wait...");
	document.getElementById('assimilatorStarter').disabled = true;
	let fp = document.getElementById('localinput');
	let fr = new FileReader();
	fr.onload = function()
	{
		playerData = fr.result;
		let clipped = playerData.substr(0, 500)+" [...]";
		document.getElementById('playertext').value = clipped;
		startAssimilating('local-input');
	};
	fr.readAsText(fp.files[0]);
}

function onTextPaste(event) {
	showStatus("Pasting. Please wait...");
	document.getElementById('assimilatorStarter').disabled = true;
	let paste = event.clipboardData || window.clipboardData;
	if (paste) {
		playerData = paste.getData('text');
		let clipped = playerData.substr(0, 500)+" [...]";
		document.getElementById('playertext').value = clipped;
		startAssimilating('pasted-input');
		event.preventDefault();
		return false;
	}
	return true;
}

function startAssimilating(source = 'unknown') {
	showStatus("Preparing to import rosters...");
	let config = {
		'successCallback': doneAssimilating,
		'errorCallback': errorAssimilating,
		'progressCallback': showStatus,
		'debugCallback': debugCallback,
		'dispatcher': 'sttat-web',
		'dispatcherVersion': STTATWEB_VERSION
	};
	async(function () {
		if (playerData == "") playerData = document.getElementById('playertext').value;
		let assimilator = new Assimilator(config);
		assimilator.parse(playerData, source);
	});
}

function doneAssimilating(imported) {
	sttat = imported;
	expertSave();
	writeUpdateTime(false);
	readyCrewFinder();
	readyVoyagersForm();
	resetAssimilator();
	showFinalStatus();
	document.getElementById('first').scrollIntoView();
}

function errorAssimilating(message) {
	showFinalStatus(message, false, false);
	playerData = "";
	document.getElementById('playertext').classList.remove('hide');
	document.getElementById('assimilatorStarter').disabled = false;
}

function resetAssimilator() {
	playerData = "";
	document.getElementById('playertext').value = "";
	document.getElementById('playertext').classList.remove('hide');
	document.getElementById('localinput').value = "";
	document.getElementById('assimilatorStarter').disabled = false;
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

	let shipTraits = ['','andorian','borg','breen','cardassian','emp','explorer','freighter','hologram','klingon','romulan','ruthless','scout','spore_drive','terran','tholian','transwarp','vulcan','warship'];
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
	if (voyage._default_excludes) {
		for (let i = 0; i < voyage._default_excludes.length; i++) {
			let excluded = sttat.crew.find(crewman => crewman.id == voyage._default_excludes[i]);
			excludeCrew.push({'id': excluded.id, 'name': excluded.name});
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

	// If prime skills target generalists (CMD, DIP, SEC),
	//	favor voyagers who would be specialists (have at least 1 of ENG, SCI, MED)
	if (voyage.skills.primary_skill == "CMD" || voyage.skills.secondary_skill == "CMD"
		|| voyage.skills.primary_skill == "DIP" || voyage.skills.secondary_skill == "DIP"
		|| voyage.skills.primary_skill == "SEC" || voyage.skills.secondary_skill == "SEC") {
		document.getElementById('in-specialists').checked = true;
	}
	else {
		document.getElementById('in-specialists').checked = false;
	}

	document.getElementById('voyagerStarter').disabled = false;
	document.getElementById('voyageInput').classList.remove('hide');
	document.getElementById('voyageOutput').classList.add('hide');
	document.getElementById('voyagers').classList.remove('hide');
}

function writeUpdateTime(bFromLocal = false) {
	let assimilatorTime = new Date(sttat.meta.update_time);
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

	// Rosters, config are required to instantiate
	let rosters = {
		'crew': sttat.crew,
		'ships': sttat.ships
	};
	let config = {
		'runAsync': true,
		'successCallback': doneRecommending,
		'errorCallback': errorRecommending,
		'progressCallback': showStatus,
		'debugCallback': debugCallback
	};
	// Voyage, boosts are required to assemble a lineup
	//	Options, optimize are optional
	let voyage = {
		'skills': skills,
		'crew_slots': slots,
		'ship_trait': document.getElementById('in-shiptrait').value,
		'_default_excludes': excludeIds /* Include here to remember on next recommendation */
	};
	let boosts = {
		'primary': 3.5,
		'secondary': 2.5,
		'other': 1
	};
	let options = {
		'excludes': excludeIds,
		'favorSpecialists': document.getElementById('in-specialists').checked,
		'considerFrozen': document.getElementById('in-frozen').checked,
		'excludeImmortals': document.getElementById('in-immortals').checked,
		'max_rarity': document.getElementById('in-maxrarity').value
	};
	let optimize = {
		'calculator': ChewableConverter,
		'maxAttempts': 10
	};
	async(function () {
		let voyagers = new Voyagers(rosters, config);
		voyagers.assemble(voyage, boosts, options, optimize);
	});
}

function doneRecommending(manifest, estimates) {
	// Remember voyage details for next recommendation
	//	Manifest (i.e. actual recommendations) is not saved
	sttat.voyage = manifest.voyage;
	expertSave();

	document.getElementById('out-ship').innerHTML = manifest.ship.name;
	document.getElementById('out-shipindex').innerHTML = getShipIndex(manifest.ship.id);
	let sShipTrait = manifest.voyage.ship_trait;
	if (manifest.ship.isIdeal) sShipTrait += " &check;";
	document.getElementById('out-shiptrait').innerHTML = sShipTrait;
	document.getElementById('out-antimatter').innerHTML = manifest.ship.antimatter + manifest.lineup.antimatter;
	document.getElementById('out-antimatter').setAttribute('title', manifest.ship.antimatter+' from the ship + '+manifest.lineup.antimatter+' from the crew');
	for (let iSkill = 0; iSkill < SKILL_IDS.length; iSkill++) {
		let skill = SKILL_IDS[iSkill];
		let tdSkill = document.getElementById('out-skill['+skill+']');
		tdSkill.innerHTML = Math.floor(manifest.lineup.skills[skill]);
		if (skill == manifest.voyage.skills.primary_skill
			|| skill == manifest.voyage.skills.secondary_skill) {
			tdSkill.classList.add('prime');
		}
		else {
			tdSkill.classList.remove('prime');
		}
	}
	let sEstimate = "";
	if (estimates) {
		sEstimate = "Estimated voyage length: <b>"+estimates.print() + "</b>";
		let sChances = estimates.printChances();
		if (sChances != "") sEstimate += " ("+sChances+")";
	}
	document.getElementById("voyageEstimate").innerHTML = sEstimate;

	for (let i = 0; i < manifest.lineup.crew.length; i++) {
		let bonus = manifest.lineup.traits[i] ? " &check;" : "";
		let trait = manifest.voyage.crew_slots[i].trait;
		document.getElementById('out-matched['+i+']').innerHTML = trait+bonus;
		document.getElementById('out-crew['+i+']').innerHTML = "";
		let span = document.createElement('span');
		span.id = 'assigned['+i+']';
		let assigned = sttat.crew.find(crewman => crewman.id == manifest.lineup.crew[i].id);
		span.innerHTML = assigned.name;
		span.setAttribute('crewId', assigned.id);
		document.getElementById('out-crew['+i+']').appendChild(span);
	}

	document.getElementById('voyageOutput').classList.remove('hide');
	document.getElementById('voyageInput').classList.add('hide');
	document.getElementById('voyagers').scrollIntoView();
	showFinalStatus();
}

function errorRecommending(message) {
	showFinalStatus(message, false, false);
	readyVoyagersForm();
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

function editVoyage() {
	for (let i = 0; i < 12; i++) {
		let span = document.getElementById('assigned['+i+']');
		if (span.classList.contains('strike')) {
			sttat.voyage._default_excludes.push(span.getAttribute('crewId'));
		}
	}
	readyVoyagersForm();
	document.getElementById('voyagers').scrollIntoView();
}

/* Crew Finder */
function readyCrewFinder() {
	if (!sttat) return;
	findCrew();
	document.getElementById('finder').classList.remove('hide');
}

function addTraitCriteria(trait) {
	let filter = document.getElementById('filter-trait');
	filter.value = trait;
	findCrew();
	document.getElementById('finder').scrollIntoView();
	hideCard();
	return false;
}

function clearTraitCriteria() {
	document.getElementById('filter-trait').value = "";
	document.getElementById('filter-clear').classList.add('hide');
	findCrew();
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
	let sTraits = document.getElementById('filter-trait').value;
	if (sTraits != "") {
		let rTraits = sTraits.split(/[,|&]+/);
		for (let t = 0; t < rTraits.length; t++) {
			let re = new RegExp("^"+rTraits[t].trim().replace(/\s+/g, '_').replace(/[^A-Za-z0-9_]+/g, ''), 'i');
			let found = sttat.crewtraits.filter(trait => re.test(trait.name));
			for (let f = 0; f < found.length; f++) {
				traits.push(found[f].name);
			}
			if (found.length == 0) traits.push('');
		}
		document.getElementById('filter-clear').classList.remove('hide');
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
			for (let t = 0; t < traits.length; t++) {
				if (sttat.crew[i].traits.indexOf(traits[t]) >= 0) {
					bConsider = true;
					break;
				}
				else if (sttat.crew[i].traits_hidden.indexOf(traits[t]) >= 0) {
					bConsider = true;
					break;
				}
			}
		}
		if (iScore > 0 && bConsider) {
			let sRarity = '★'.repeat(sttat.crew[i].rarity)
							+'☆'.repeat(sttat.crew[i].max_rarity-sttat.crew[i].rarity);
			let crewman = {
				'id': sttat.crew[i].id,
				'name': sttat.crew[i].name,
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
	document.getElementById('card-level').innerHTML = carded._immortal ? "Immortal" : "Level "+carded.level;
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
			tr.append(tdSkill, tdCore, tdRange, tdAverage);
			tbody.appendChild(tr);
		}
	}

	document.getElementById('card-voyage').innerHTML = Math.floor(iVoyage);

	let sTraits = "";
	for (let t = 0; t < carded._variants.length; t++) {
		let trait = carded._variants[t];
		if (sTraits != "") sTraits += ", ";
		sTraits += "<a href=\"#\" onclick=\"return addTraitCriteria('"+trait+"');\">"+trait+"</a>";
	}
	for (let t = 0; t < carded.traits.length; t++) {
		let trait = carded.traits[t];
		if (sTraits != "") sTraits += ", ";
		sTraits += "<a href=\"#\" onclick=\"return addTraitCriteria('"+trait+"');\">"+trait+"</a>";
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

function hideCard() {
	let card = document.getElementById('card');
	card.classList.remove('showing');
	card.removeAttribute('crewId');
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