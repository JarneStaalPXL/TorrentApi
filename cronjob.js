let startTime;
let endTime;

module.exports.startCronJob = function startCronJob(startTimeArg, endTimeArg) {
    console.log("Start time argument:", startTimeArg);
        console.log("End time argument:", endTimeArg);

    function parseTimeArgument(timeArg) {
        const [hours, minutes] = timeArg.split(":").map(Number);
        return { hours, minutes };
    }

    startTime = parseTimeArgument(startTimeArg);
    endTime = parseTimeArgument(endTimeArg);

    console.log("Start time:", startTime);
    console.log("End time:", endTime);
};

function isTimeBetween(nowTime, startTime, endTime) {
    const nowMinutes = nowTime.hours * 60 + nowTime.minutes;
    const startMinutes = startTime.hours * 60 + startTime.minutes;
    const endMinutes = endTime.hours * 60 + endTime.minutes;

    return nowMinutes >= startMinutes && nowMinutes <= endMinutes;
}

module.exports.canCronJobStart = function canCronJobStart() {
        const now = new Date();
        const nowHours = now.getHours();
        const nowMinutes = now.getMinutes();
        const nowTime = { hours: nowHours, minutes: nowMinutes };

        if(startTime == undefined || endTime == undefined) {
            console.log("Start time or end time is undefined");
            return true;
        }
        if (startTime.hours < endTime.hours) {
            // Start and end time are on the same day
            return isTimeBetween(nowTime, startTime, endTime);
        } else if (startTime.hours > endTime.hours) {
            // Start and end time are on different days
            const isTimeBetweenStartAndMidnight = isTimeBetween(nowTime, startTime, { hours: 23, minutes: 59 });
            const isTimeBetweenMidnightAndEnd = isTimeBetween(nowTime, { hours: 0, minutes: 0 }, endTime);
            return isTimeBetweenStartAndMidnight || isTimeBetweenMidnightAndEnd;
        } else {
            // Start and end time are the same
            return false;
        }
    }

  
