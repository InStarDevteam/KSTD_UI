using System.Text;

namespace Kstd.Api;

public static class BusinessRules
{
    public const long MaxFileSize = 5 * 1024 * 1024;
    public static readonly string[] Statuses = ["submitted", "in_progress", "completed", "rejected"];
    public static readonly string[] Categories = ["general", "access", "software", "other"];

    public static Dictionary<string, string[]> Validate(string? title, string? category, string? description)
    {
        var errors = new Dictionary<string, string[]>();
        if (string.IsNullOrWhiteSpace(title) || title.Trim().Length is < 3 or > 100)
        {
            errors["title"] = ["제목은 3~100자로 입력하세요."];
        }
        if (category is null || !Categories.Contains(category))
        {
            errors["category"] = ["요청 분류를 선택하세요."];
        }
        if (string.IsNullOrWhiteSpace(description) || description.Trim().Length is < 10 or > 5000)
        {
            errors["description"] = ["내용은 10~5000자로 입력하세요."];
        }
        return errors;
    }

    public static bool CanTransition(string current, string? next) =>
        (current, next) is ("submitted", "in_progress" or "rejected") or ("in_progress", "completed" or "rejected");

    public static string? DetectContent(string extension, byte[] bytes)
    {
        if (extension == ".pdf" && bytes.AsSpan().StartsWith("%PDF-"u8))
        {
            return "application/pdf";
        }
        if (extension == ".png" && bytes.AsSpan().StartsWith(new byte[] { 137, 80, 78, 71, 13, 10, 26, 10 }))
        {
            return "image/png";
        }
        if (extension != ".txt" || bytes.Contains((byte)0))
        {
            return null;
        }
        try
        {
            var content = new UTF8Encoding(false, true).GetString(bytes);
            return content.Any(character => char.IsControl(character) && character is not '\r' and not '\n' and not '\t' and not '\uFEFF') ? null : "text/plain";
        }
        catch (DecoderFallbackException)
        {
            return null;
        }
    }

    public static string SafeFileName(string original)
    {
        var name = Path.GetFileName(original.Replace('\\', '/'));
        name = new string(name.Where(character => !char.IsControl(character) && character != '"').ToArray());
        return string.IsNullOrWhiteSpace(name) ? "attachment.txt" : name[..Math.Min(name.Length, 160)];
    }
}
