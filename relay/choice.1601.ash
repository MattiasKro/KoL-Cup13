import "relay/choice.ash";

//Choice override for "Cup of 13s" use page

void main(string page_text_encoded)
{
	string page_text = page_text_encoded.choiceOverrideDecodePageText();

    string replaceText = "</body>";
    string injection =
        '<link rel="stylesheet" type="text/css" href="lib/tabulator.min.css">' + "\n" +
        '<link rel="stylesheet" type="text/css" href="cup13.css">' + "\n" +
        '<script type="text/javascript" src="lib/tabulator.min.js"></script>' + "\n" +
        '<script type="text/javascript" src="cup13.js"></script>' + "\n" +
        '<script type="text/javascript" src="cup13.ui.js"></script>' + "\n" +
        '<script type="text/javascript">Cup13.init();</script>';

    string newPage = page_text.replace_string(replaceText, injection + "\n" + replaceText);

    print("Page loaded", "green");
    newPage.write();	
}
