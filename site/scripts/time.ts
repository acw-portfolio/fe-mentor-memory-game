export function getTimeStamp(time) {

    const min = Math.floor(time / 60000);
    const sec = ("0" + Math.floor((time / 1000) % 60)).slice(-2);
    return `${min}:${sec}`;
}