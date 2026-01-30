"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Access = exports.Role = void 0;
exports.roleToString = roleToString;
exports.accessToString = accessToString;
var Role;
(function (Role) {
    Role[Role["None"] = 0] = "None";
    Role[Role["Host"] = 1] = "Host";
    Role[Role["Guest"] = 2] = "Guest";
})(Role || (exports.Role = Role = {}));
var Access;
(function (Access) {
    Access[Access["None"] = 0] = "None";
    Access[Access["ReadOnly"] = 1] = "ReadOnly";
    Access[Access["ReadWrite"] = 3] = "ReadWrite";
    Access[Access["Owner"] = 255] = "Owner";
})(Access || (exports.Access = Access = {}));
function roleToString(role) {
    return Role[role] || "Unknown";
}
function accessToString(access) {
    return Access[access] || "Unknown";
}
//# sourceMappingURL=liveshareHelpers.js.map