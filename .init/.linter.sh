#!/bin/bash
cd /home/kavia/workspace/code-generation/travel-planner-pro-195079-195113/travel_planner_frontend
npm run build
EXIT_CODE=$?
if [ $EXIT_CODE -ne 0 ]; then
   exit 1
fi

