#!/usr/bin/env bash
cd "$(dirname "$0")"
export STUDY_EMAIL=study@example.com
export STUDY_PASSWORD='StudyPass123!'; ./kane-study.sh mealie community 9965; ./kane-study.sh mealie official 9964; ./kane-study.sh mealie claude 9966
export STUDY_USERNAME=study; ./kane-study.sh vikunja official 9967; ./kane-study.sh vikunja community 9968; ./kane-study.sh vikunja claude 9969
export STUDY_PASSWORD='StudyPass#2026'; ./kane-study.sh n8n community 9945; ./kane-study.sh n8n official 9944
cd ../demo/mealie-fix && export RIPCORD_EMAIL=changeme@example.com RIPCORD_PASSWORD=MyPassword && cp ripcord.before-fix.yml ripcord.yml && rm -f .ripcord/state.json && node ../../dist/cli.js fix > ../../work/fix3.log 2>&1; echo "fix exit $?" >> ../../work/fix3.log
