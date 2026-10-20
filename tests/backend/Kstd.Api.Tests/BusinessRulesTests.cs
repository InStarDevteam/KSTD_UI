using System.Text;
using Kstd.Api;
using Microsoft.AspNetCore.Identity;

namespace Kstd.Api.Tests;

public sealed class BusinessRulesTests
{
    [Theory]
    [InlineData("submitted", "in_progress", true)]
    [InlineData("submitted", "rejected", true)]
    [InlineData("in_progress", "completed", true)]
    [InlineData("in_progress", "rejected", true)]
    [InlineData("submitted", "completed", false)]
    [InlineData("completed", "submitted", false)]
    [InlineData("rejected", "in_progress", false)]
    [InlineData("in_progress", "submitted", false)]
    [InlineData("submitted", "submitted", false)]
    [InlineData("submitted", null, false)]
    public void BE_UNIT_001_StateTransitions(string current, string? next, bool expected) => Assert.Equal(expected, BusinessRules.CanTransition(current, next));

    [Theory]
    [InlineData("정상 요청", "general", "요청 상세 내용 열 글자 이상입니다.", 0)]
    [InlineData(null, "general", "요청 상세 내용 열 글자 이상입니다.", 1)]
    [InlineData("짧음", "general", "요청 상세 내용 열 글자 이상입니다.", 1)]
    [InlineData("정상 요청", "admin", "요청 상세 내용 열 글자 이상입니다.", 1)]
    [InlineData("정상 요청", "access", null, 1)]
    [InlineData("정상 요청", null, "짧음", 2)]
    public void BE_UNIT_002_DtoValidation(string? title, string? category, string? description, int errors) => Assert.Equal(errors, BusinessRules.Validate(title, category, description).Count);

    [Fact]
    public void BE_UNIT_003_LengthBoundaries()
    {
        Assert.Empty(BusinessRules.Validate(new string('가', 100), "software", new string('나', 5000)));
        var result = BusinessRules.Validate(new string('가', 101), "software", new string('나', 5001));
        Assert.Contains("title", result.Keys);
        Assert.Contains("description", result.Keys);
    }

    [Theory]
    [InlineData(".txt", "한글\n줄바꿈\t탭", "text/plain")]
    [InlineData(".pdf", "%PDF-1.7\nexample", "application/pdf")]
    [InlineData(".png", "%PDF-wrong", null)]
    [InlineData(".pdf", "fake pdf", null)]
    [InlineData(".exe", "executable", null)]
    [InlineData(".txt", "control\0null", null)]
    public void BE_UNIT_004_FileSignatures(string extension, string content, string? expected) => Assert.Equal(expected, BusinessRules.DetectContent(extension, Encoding.UTF8.GetBytes(content)));

    [Fact]
    public void BE_UNIT_005_PngAndInvalidUtf8()
    {
        Assert.Equal("image/png", BusinessRules.DetectContent(".png", [137, 80, 78, 71, 13, 10, 26, 10, 0]));
        Assert.Null(BusinessRules.DetectContent(".txt", [0xff, 0xfe, 0xfd]));
        Assert.Null(BusinessRules.DetectContent(".txt", [1, 2, 3]));
    }

    [Theory]
    [InlineData("../../secret.txt", "secret.txt")]
    [InlineData("C:\\uploads\\자료.txt", "자료.txt")]
    [InlineData("a\r\nb.txt", "ab.txt")]
    [InlineData("\"name.txt", "name.txt")]
    [InlineData("", "attachment.txt")]
    public void BE_UNIT_006_SafeFileNames(string input, string expected) => Assert.Equal(expected, BusinessRules.SafeFileName(input));

    [Fact]
    public void BE_UNIT_007_FrameworkPasswordHash()
    {
        var user = new AppUser { Email = "example@sample.test", DisplayName = "가상", Role = "user", PasswordHash = "" };
        var hasher = new PasswordHasher<AppUser>();
        var first = hasher.HashPassword(user, "TestPasswordOnly!123");
        var second = hasher.HashPassword(user, "TestPasswordOnly!123");
        Assert.NotEqual(first, second);
        Assert.Equal(PasswordVerificationResult.Success, hasher.VerifyHashedPassword(user, first, "TestPasswordOnly!123"));
        Assert.Equal(PasswordVerificationResult.Failed, hasher.VerifyHashedPassword(user, first, "wrong"));
    }
}
