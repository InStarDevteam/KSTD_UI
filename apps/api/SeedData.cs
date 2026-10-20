using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace Kstd.Api;

public static class SeedData
{
    public static async Task Initialize(AppDb db, IPasswordHasher<AppUser> hasher, IHostEnvironment environment)
    {
        if (Environment.GetEnvironmentVariable("SAMPLE_SEED") != "true")
        {
            return;
        }
        if (!environment.IsDevelopment())
        {
            throw new InvalidOperationException("Sample seed is forbidden outside Development.");
        }
        if (await db.Users.AnyAsync())
        {
            return;
        }
        var userPassword = RequirePassword("SAMPLE_USER_PASSWORD");
        var adminPassword = RequirePassword("SAMPLE_ADMIN_PASSWORD");
        var user = NewUser("user@sample.test", "샘플 사용자", "user", userPassword, hasher);
        var admin = NewUser("admin@sample.test", "샘플 관리자", "admin", adminPassword, hasher);
        var other = NewUser("other@sample.test", "다른 샘플 사용자", "user", userPassword, hasher);
        db.Users.AddRange(user, admin, other);
        await db.SaveChangesAsync();
        var titles = new[] { "회의실 화면 공유 장비 점검", "업무 시스템 접근 권한 요청", "개발 도구 설치 요청", "사내 안내문 접근성 검토", "처리 이력 예시 요청", "공용 자료 정리 요청" };
        for (var index = 0; index < titles.Length; index++)
        {
            var status = BusinessRules.Statuses[index % 4];
            var request = new WorkRequest { Title = titles[index], Category = BusinessRules.Categories[index % 4], Description = "이 자료는 실제 개인정보를 포함하지 않은 가상 업무요청입니다. 요청 내용을 검토하고 처리해 주세요.", OwnerId = user.Id, Status = status, CreatedAt = DateTime.UtcNow.AddDays(-index) };
            request.Histories.Add(new RequestHistory { ActorId = user.Id, Action = "created", ToStatus = "submitted", Reason = "가상 샘플 요청 등록", CreatedAt = request.CreatedAt });
            if (status != "submitted")
            {
                request.Histories.Add(new RequestHistory { ActorId = admin.Id, Action = "status_changed", FromStatus = "submitted", ToStatus = status == "completed" ? "in_progress" : status, Reason = "가상 처리 예시" });
                if (status == "completed")
                {
                    request.Histories.Add(new RequestHistory { ActorId = admin.Id, Action = "status_changed", FromStatus = "in_progress", ToStatus = "completed", Reason = "가상 완료 예시" });
                }
            }
            db.Requests.Add(request);
        }
        db.Requests.Add(new WorkRequest { Title = "다른 사용자의 비공개 요청", Category = "other", Description = "객체 단위 접근권한을 실제로 검사하기 위한 가상 요청입니다.", OwnerId = other.Id });
        await db.SaveChangesAsync();
    }

    private static string RequirePassword(string variable)
    {
        var password = Environment.GetEnvironmentVariable(variable);
        return password is { Length: >= 12 and <= 1024 } ? password : throw new InvalidOperationException($"{variable} must be injected with at least 12 characters. No default password is provided.");
    }

    private static AppUser NewUser(string email, string name, string role, string password, IPasswordHasher<AppUser> hasher)
    {
        var user = new AppUser { Email = email, DisplayName = name, Role = role, PasswordHash = "" };
        user.PasswordHash = hasher.HashPassword(user, password);
        return user;
    }
}
