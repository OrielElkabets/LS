import { LsLnInfo } from "./LS";

// When you want LS to generate CSS variables for you,
// ensure your ln.json contains the required LsLnInfo structure.
// You can validate your lsInfo here.

// 1. Define your font types using a union.
type Fonts = "regular"

// 2. Test your lsInfo structure with this example.
// You can use your IDE IntelliSense to see the valid options for each field.
// Make sure there are no errors. If it works fine, you can copy it to your ln.json file.
const test: LsLnInfo<Fonts> = {
    "lsInfo": {
        "direction": "ltr",
        "fonts": {
            "regular": {
                "family": "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
                "style": "normal",
                "weight": "300"
            }
        }
    }
}