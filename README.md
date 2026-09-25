# expfactory-task-demo

A minimal "hello world" cognitive task for the [Experiment Factory](https://expfactory.github.io/)
deployment platform ([expfactory-deploy](https://github.com/expfactory/expfactory-deploy)),
hosted at <https://deploy.expfactory.org/>.

It contains a single experiment, **`flanker_demo`**: a minimal Eriksen
flanker task built with [jsPsych 7](https://www.jspsych.org/), following the
conventions of the [Poldrack Lab RDoC battery](https://github.com/lobennett/expfactory-experiments-rdoc).

Participants see five arrows (e.g. `>><>>`) and press a key indicating the
direction of the **center** arrow. The response-key mapping (`z`/`m`) is
counterbalanced across participants using the battery's `group_index`
(`window.efVars.group_index`). The task runs a short practice block with
feedback, then two test blocks, and takes about 3 minutes.

## Repository structure

expfactory-deploy crawls a repository for folders containing a valid
`config.json`; each such folder is one experiment:

```
expfactory-task-demo/
├── create_experiment.py   # scaffold a new experiment (run with `uv run`)
└── flanker_demo/          # folder name == exp_id
    ├── config.json        # experiment metadata + list of files to load
    ├── experiment.js      # the jsPsych 7 timeline
    └── style.css          # experiment-specific styles
```

## The expfactory-deploy contract

1. **`config.json`** declares the experiment. The important fields:
   - `"exp_id": "flanker_demo"` — must match the folder name.
   - `"template": "jspsych"`.
   - `"run"` — the ordered list of files injected into the page as
     `<script>`/`<link>` tags. Entries starting with `static/` are shared
     assets served by the deploy server (jsPsych 7 core, plugins, CSS);
     relative entries (`style.css`, `experiment.js`) are served from this
     folder in the repo.
2. **Battery variables.** The deploy page injects `window.efVars` (e.g.
   `{ group_index: 3 }`) before loading the experiment scripts; read it at
   parse time (this demo uses it to counterbalance response keys).
3. **jsPsych 7 boot sequence.** The deploy page does, in effect:

   ```js
   jsPsych = initJsPsych({ on_finish: onFinish }); // onFinish POSTs your data
   if (window["flanker_demo_init"]) flanker_demo_init();
   jsPsych.run(flanker_demo_experiment);
   ```

   So `experiment.js` must define two globals named after the exp_id:
   - `var <exp_id>_experiment` — an array (the timeline)
   - `function <exp_id>_init()` — pushes trials onto the array

   Because `jsPsych` (the instance) only exists after `initJsPsych()` runs in
   the page body, only reference `jsPsych` **inside functions** that are
   evaluated at trial runtime (function-valued parameters like
   `stimulus: getStim`, `on_finish`, etc.). Plugin constructors
   (`jsPsychHtmlKeyboardResponse`, etc.) are loaded with the page and can be
   used at the top level. Two pitfalls this demo avoids:
   - `jsPsych.timelineVariable(...)` at the top level (instance doesn't exist
     yet) — use function-valued parameters that pop from a pre-shuffled queue.
   - The `repetitions` timeline parameter re-fires `on_timeline_start` on
     every repetition — build a flat repeated timeline array instead.
4. **Data saving is automatic.** When the timeline finishes, the deploy page
   POSTs `jsPsych.data` to the server. To also sync data mid-experiment, call
   `window.dataSync()` (this demo does so before the end screen).

## Deploying to https://deploy.expfactory.org/

1. Push this repository to GitHub.
2. Log in to <https://deploy.expfactory.org/>, go to the experiments section,
   and add a new experiment repository using the GitHub URL
   (e.g. `https://github.com/<user>/expfactory-task-demo`). The server clones
   the repo and discovers `flanker_demo` via its `config.json`.
3. Add the experiment to a battery and open the battery link (or use the
   experiment preview) to run it.

## Running locally with expfactory-deploy-local

[`expfactory-deploy-local`](https://github.com/expfactory/expfactory-deploy)
is a lightweight local server that runs experiments exactly the way
deploy.expfactory.org does (same template, same boot sequence) and saves data
to local files instead of a database. Use it to test tasks before deploying.

### Setup

```bash
# 1. Clone the expfactory-deploy repository (contains expfactory_deploy_local)
git clone https://github.com/expfactory/expfactory-deploy
cd expfactory-deploy

# 2. Create a virtual environment and install the local deployment package.
#    With uv:
uv venv
source .venv/bin/activate
uv pip install -e expfactory_deploy_local

#    ...or with plain pip:
#    python3 -m venv .venv
#    source .venv/bin/activate
#    pip install -e expfactory_deploy_local
```

Note: the package directory is `expfactory_deploy_local` (with underscores),
inside the `expfactory-deploy` repo.

### Running an experiment

From the root of *this* repository (with the virtual environment activated):

```bash
expfactory_deploy_local -e flanker_demo
```

Then open <http://localhost:8080/> in Chrome or Firefox. If port 8080 is busy
the server tries the next port — check the terminal output for the actual port.

Useful options:

```bash
# Inject a group_index (exposed to the task as window.efVars.group_index)
expfactory_deploy_local -e flanker_demo -gi 1

# Serve several experiments as a battery (comma-separated paths)
expfactory_deploy_local -e flanker_demo,another_task

# BIDS-style data output
expfactory_deploy_local -e flanker_demo -sub 01 -ses 1 -run 1 \
    -raw ./data/raw -bids ./data/bids
```

`-e` accepts paths, so it also works from anywhere with an absolute path,
e.g. `expfactory_deploy_local -e /path/to/expfactory_task_demo/flanker_demo`.

### Local data output

Data is saved on **every** POST the page makes — both the mid-experiment
`window.dataSync()` sync and the final save when the timeline finishes. Each
POST writes a raw JSON payload to the current directory (or to `-raw` if
given, using `sub-<id>/ses-<n>/` subdirectories when `-sub`/`-ses` are set):

```
task-<exp_id>_dateTime-<timestamp>.json
```

The file from the final POST contains the complete dataset: the `trialdata`
field holds every jsPsych data row, and `interactionData` records browser
focus/blur events. (A JSON from a mid-experiment sync contains only the data
collected up to that point.)

CSV events files (`task-<exp_id>.csv`) are only written for fMRI task
variants — experiment folders whose name contains `__fmri` — when `-bids` is
given, e.g. `expfactory_deploy_local -e flanker_demo__fmri -bids ./data/bids`.
For quick CSV conversion of the raw JSON:

```bash
uv run --with pandas python -c "
import json, pandas as pd
d = json.load(open('task-flanker_demo_dateTime-<timestamp>.json'))
pd.DataFrame(json.loads(d['trialdata'])).to_csv('flanker_demo.csv', index=False)
"
```

## Creating a new experiment (quickstart)

Requires [uv](https://docs.astral.sh/uv/). From the root of this repository:

```bash
uv run create_experiment.py
```

The script prompts for the required fields (experiment id, display name,
contributors, estimated minutes) and creates a new folder
`<exp_id>/` containing `config.json`, `experiment.js`, and `style.css`. The
generated experiment is a copy of `flanker_demo` with the exp_id placeholders
filled in — a working task you can deploy immediately and then customize. It
uses only the Python standard library; `uv run` executes it without any
environment setup.

Then commit, push, and pull the latest commit into your experiment repository
on <https://deploy.expfactory.org/> to make the new experiment available to
batteries.

## Making your own task from this template (manually)

1. Copy `flanker_demo/` to a new folder, e.g. `my_task/`.
2. Rename `exp_id` in `config.json` to `my_task`.
3. In `experiment.js`, rename `flanker_demo_experiment` → `my_task_experiment`
   and `flanker_demo_init` → `my_task_init`, and update `expID`.
4. Replace the stimuli, trial definitions, and timing with your own.
